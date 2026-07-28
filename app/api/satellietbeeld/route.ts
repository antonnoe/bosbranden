import zlib from "node:zlib";
import { GEO_BBOX } from "@/lib/kaart-projectie";
import { KAART_VIEWBOX } from "@/lib/kaart-paths";

export const runtime = "nodejs";
export const revalidate = 600; // 10 minuten (GIBS/EUMETSAT-bron ververst elke tien minuten)

// NASA GIBS — vrij, zonder key. We vragen het beeld op met exact de bbox van de
// tool en met WIDTH/HEIGHT gelijk aan KAART_VIEWBOX; GIBS honoreert die en rekt
// het plate-carrée-beeld naar de projectie van de tool, zodat het samenvalt met
// de SVG-departementsgrenzen.
const GIBS_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const TOEGESTANE_LAGEN = new Set([
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  "MODIS_Terra_CorrectedReflectance_TrueColor",
]);
const STANDAARD_LAAG = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const MAX_DAGEN_TERUG = 4;

// De granule van vandaag is er vaak nog niet: dan levert GIBS een klein beeld
// met één kleur. We verwerpen zo'n beeld op bytegrootte én aantal kleuren.
const MIN_BYTES = 8000;
const MIN_KLEUREN = 8;

const [, , VIEW_W, VIEW_H] = KAART_VIEWBOX.split(" ").map(Number);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const gevraagdeLaag = params.get("laag") ?? STANDAARD_LAAG;
  const laag = TOEGESTANE_LAGEN.has(gevraagdeLaag) ? gevraagdeLaag : STANDAARD_LAAG;
  // meta=1: geen beeld, alleen de gekozen datum als JSON. De Leaflet-tegellaag
  // heeft alleen de datum nodig; het beeld haalt Leaflet zelf per tegel op.
  const meta = params.get("meta") === "1";

  const bbox = `${GEO_BBOX.minLon},${GEO_BBOX.minLat},${GEO_BBOX.maxLon},${GEO_BBOX.maxLat}`;

  const probeersels: Array<{ datum: string; bytes: number; kleuren: number; leeg: boolean }> = [];

  for (let terug = 0; terug <= MAX_DAGEN_TERUG; terug += 1) {
    const datum = datumTerug(terug);
    try {
      const beeld = await haalBeeldOp(laag, bbox, datum);
      const bytes = beeld.byteLength;
      const kleuren = telUniekeKleuren(Buffer.from(beeld), 64);
      const leeg = bytes < MIN_BYTES || (kleuren >= 0 && kleuren < MIN_KLEUREN);
      probeersels.push({ datum, bytes, kleuren, leeg });

      if (!leeg && meta) {
        return Response.json(
          { beschikbaar: true, datum, laag, bron: "NASA GIBS / EOSDIS", probeersels },
          {
            headers: {
              "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
            },
          }
        );
      }

      if (!leeg) {
        return new Response(beeld, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
            "X-Satelliet-Datum": datum,
            "X-Satelliet-Laag": laag,
            "X-Satelliet-Bron": "NASA GIBS / EOSDIS",
            // Observeerbaarheid: per geprobeerde dag de bytegrootte, het aantal
            // kleuren en of hij als leeg is verworpen.
            "X-Satelliet-Probeersels": JSON.stringify(probeersels),
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    } catch {
      probeersels.push({ datum, bytes: 0, kleuren: -1, leeg: true });
    }
  }

  // Niets bruikbaars binnen de terugvalketen: nette 502, geen 500.
  return Response.json(
    {
      beschikbaar: false,
      laag,
      opmerking:
        "Er is de afgelopen dagen geen bruikbaar satellietbeeld beschikbaar (alle granules leeg of onbereikbaar).",
      probeersels,
    },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  );
}

async function haalBeeldOp(laag: string, bbox: string, datum: string): Promise<ArrayBuffer> {
  const url = new URL(GIBS_URL);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.1.1");
  url.searchParams.set("REQUEST", "GetMap");
  url.searchParams.set("LAYERS", laag);
  url.searchParams.set("SRS", "EPSG:4326");
  url.searchParams.set("FORMAT", "image/png");
  url.searchParams.set("BBOX", bbox);
  url.searchParams.set("WIDTH", String(VIEW_W));
  url.searchParams.set("HEIGHT", String(VIEW_H));
  url.searchParams.set("TIME", datum);

  const res = await fetch(url, {
    headers: { Accept: "image/png,image/*;q=0.9,*/*;q=0.2" },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`GIBS status ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("image/")) throw new Error(`GIBS gaf ${type}`);
  return res.arrayBuffer();
}

function datumTerug(dagen: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dagen);
  return d.toISOString().slice(0, 10);
}

// Telt de unieke kleuren in een 8-bits PNG (colorType 2 of 6, niet-interlaced).
// Retourneert -1 als het beeld niet betrouwbaar te decoderen is; dan valt de
// leeg-detectie terug op alleen de bytegrootte.
function telUniekeKleuren(buf: Buffer, cap: number): number {
  try {
    if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return -1;

    let offset = 8;
    let breedte = 0;
    let hoogte = 0;
    let bitDiepte = 0;
    let kleurType = 0;
    let interlace = 0;
    const idat: Buffer[] = [];

    while (offset + 8 <= buf.length) {
      const lengte = buf.readUInt32BE(offset);
      const type = buf.toString("ascii", offset + 4, offset + 8);
      const data = buf.subarray(offset + 8, offset + 8 + lengte);
      if (type === "IHDR") {
        breedte = data.readUInt32BE(0);
        hoogte = data.readUInt32BE(4);
        bitDiepte = data.readUInt8(8);
        kleurType = data.readUInt8(9);
        interlace = data.readUInt8(12);
      } else if (type === "IDAT") {
        idat.push(Buffer.from(data));
      } else if (type === "IEND") {
        break;
      }
      offset += 12 + lengte;
    }

    const kanalen = kleurType === 2 ? 3 : kleurType === 6 ? 4 : 0;
    if (bitDiepte !== 8 || kanalen === 0 || interlace !== 0 || breedte === 0) return -1;

    const rauw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = kanalen;
    const stride = breedte * bpp;
    const kleuren = new Set<number>();
    let vorige = Buffer.alloc(stride);

    for (let y = 0; y < hoogte; y += 1) {
      const rijStart = y * (stride + 1);
      if (rijStart >= rauw.length) break;
      const filter = rauw[rijStart];
      const regel = Buffer.from(rauw.subarray(rijStart + 1, rijStart + 1 + stride));
      defilter(filter, regel, vorige, bpp);

      // Steekproefsgewijs kleuren verzamelen; snel genoeg en genoeg om "leeg"
      // (één kleur) te onderscheiden van een echt beeld.
      for (let x = 0; x < stride; x += bpp * 37) {
        const kleur = (regel[x] << 16) | (regel[x + 1] << 8) | regel[x + 2];
        kleuren.add(kleur);
        if (kleuren.size >= cap) return kleuren.size;
      }
      vorige = regel;
    }
    return kleuren.size;
  } catch {
    return -1;
  }
}

function defilter(filter: number, regel: Buffer, vorige: Buffer, bpp: number): void {
  for (let i = 0; i < regel.length; i += 1) {
    const a = i >= bpp ? regel[i - bpp] : 0; // links
    const b = vorige[i]; // boven
    const c = i >= bpp ? vorige[i - bpp] : 0; // linksboven
    let waarde = regel[i];
    switch (filter) {
      case 1:
        waarde += a;
        break;
      case 2:
        waarde += b;
        break;
      case 3:
        waarde += (a + b) >> 1;
        break;
      case 4:
        waarde += paeth(a, b, c);
        break;
      default:
        break; // 0 = None
    }
    regel[i] = waarde & 0xff;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
