import { NextRequest } from "next/server";

export const runtime = "nodejs";

const WMS_URL = "https://eccharts.ecmwf.int/wms/";
const LAAG = "composition_europe_pm_wf_forecast_surface";
const BBOX = "41.33374,-5.14127657354623,51.088394,9.559807";
const TOEGESTANE_UREN = new Set([0, 6, 12, 24]);

export async function GET(request: NextRequest) {
  const legenda = request.nextUrl.searchParams.get("legenda") === "1";

  try {
    if (legenda) return await haalLegendaOp();

    const gevraagd = Number(request.nextUrl.searchParams.get("uur") ?? "0");
    const uren = TOEGESTANE_UREN.has(gevraagd) ? gevraagd : 0;
    const tijd = await kiesGeldigeTijd(uren);

    let afbeelding = await haalKaartOp(tijd);
    if (!afbeelding.ok) afbeelding = await haalKaartOp(null);

    if (!afbeelding.ok) {
      const fouttekst = await afbeelding.text();
      console.error("CAMS WMS-kaart niet beschikbaar", afbeelding.status, fouttekst.slice(0, 500));
      return new Response("Rookverwachting tijdelijk niet beschikbaar.", { status: 502 });
    }

    const inhoud = await afbeelding.arrayBuffer();
    const geldigeTijd = tijd ?? "meest recente beschikbare modeltijd";

    return new Response(inhoud, {
      status: 200,
      headers: {
        "Content-Type": afbeelding.headers.get("content-type") || "image/png",
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
        "X-CAMS-Valid-Time": geldigeTijd,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (fout) {
    console.error("CAMS rooklaag ophalen mislukt", fout);
    return new Response("Rookverwachting tijdelijk niet beschikbaar.", { status: 502 });
  }
}

async function haalKaartOp(tijd: string | null): Promise<Response> {
  const url = new URL(WMS_URL);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.3.0");
  url.searchParams.set("token", "public");
  url.searchParams.set("request", "GetMap");
  url.searchParams.set("layers", LAAG);
  url.searchParams.set("styles", "");
  url.searchParams.set("format", "image/png");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("bbox", BBOX);
  url.searchParams.set("width", "1000");
  url.searchParams.set("height", "959");
  if (tijd) url.searchParams.set("time", tijd);

  return fetch(url, {
    headers: {
      Accept: "image/png,image/*;q=0.9,*/*;q=0.2",
      "User-Agent": "Infofrankrijk-Bosbrandenkaart/1.0",
    },
    next: { revalidate: 600 },
  });
}

async function haalLegendaOp(): Promise<Response> {
  const url = new URL(WMS_URL);
  url.searchParams.set("token", "public");
  url.searchParams.set("request", "GetLegend");
  url.searchParams.set("layers", LAAG);
  url.searchParams.set("format", "image/png");

  const res = await fetch(url, {
    headers: {
      Accept: "image/png,image/*;q=0.9,*/*;q=0.2",
      "User-Agent": "Infofrankrijk-Bosbrandenkaart/1.0",
    },
    next: { revalidate: 86400 },
  });

  if (!res.ok) return new Response("Legenda niet beschikbaar.", { status: 502 });

  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") || "image/png",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function kiesGeldigeTijd(urenVooruit: number): Promise<string> {
  const doel = new Date();
  doel.setUTCMinutes(0, 0, 0);
  doel.setUTCHours(doel.getUTCHours() + urenVooruit);

  try {
    const tijden = await haalBeschikbareTijdenOp();
    if (tijden.length > 0) {
      let beste = tijden[0];
      let verschil = Math.abs(Date.parse(beste) - doel.getTime());

      for (const tijd of tijden.slice(1)) {
        const nieuwVerschil = Math.abs(Date.parse(tijd) - doel.getTime());
        if (nieuwVerschil < verschil) {
          beste = tijd;
          verschil = nieuwVerschil;
        }
      }

      return beste;
    }
  } catch (fout) {
    console.warn("CAMS tijdsdimensie niet uitleesbaar; doeluur wordt geprobeerd", fout);
  }

  return doel.toISOString().replace(".000Z", "Z");
}

async function haalBeschikbareTijdenOp(): Promise<string[]> {
  const url = new URL(WMS_URL);
  url.searchParams.set("token", "public");
  url.searchParams.set("request", "GetCapabilities");
  url.searchParams.set("version", "1.3.0");

  const res = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.2",
      "User-Agent": "Infofrankrijk-Bosbrandenkaart/1.0",
    },
    next: { revalidate: 1800 },
  });

  if (!res.ok) throw new Error(`GetCapabilities antwoordde met status ${res.status}`);
  const xml = await res.text();
  const naamIndex = xml.indexOf(`<Name>${LAAG}</Name>`);
  if (naamIndex < 0) throw new Error("CAMS-rooklaag ontbreekt in GetCapabilities.");

  const dimensies = [...xml.matchAll(
    /<(?:Dimension|Extent)[^>]*name=["']time["'][^>]*>([\s\S]*?)<\/(?:Dimension|Extent)>/gi
  )];
  if (dimensies.length === 0) return [];

  const dichtstbij = dimensies.reduce((beste, huidig) => {
    const besteAfstand = Math.abs((beste.index ?? 0) - naamIndex);
    const huidigeAfstand = Math.abs((huidig.index ?? 0) - naamIndex);
    return huidigeAfstand < besteAfstand ? huidig : beste;
  });

  return parseerTijdsdimensie(dichtstbij[1]);
}

function parseerTijdsdimensie(waarde: string): string[] {
  const resultaat = new Set<string>();
  const delen = waarde.replace(/\s+/g, "").split(",").filter(Boolean);

  for (const deel of delen) {
    const interval = deel.split("/");
    if (interval.length === 3) {
      const begin = Date.parse(interval[0]);
      const einde = Date.parse(interval[1]);
      const stap = parseerDuur(interval[2]);
      if (!Number.isFinite(begin) || !Number.isFinite(einde) || stap <= 0) continue;

      for (let tijd = begin; tijd <= einde && resultaat.size < 500; tijd += stap) {
        resultaat.add(new Date(tijd).toISOString().replace(".000Z", "Z"));
      }
      continue;
    }

    const tijd = Date.parse(deel);
    if (Number.isFinite(tijd)) resultaat.add(new Date(tijd).toISOString().replace(".000Z", "Z"));
  }

  return [...resultaat].sort((a, b) => Date.parse(a) - Date.parse(b));
}

function parseerDuur(isoDuur: string): number {
  const match = isoDuur.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) return 0;
  const dagen = Number(match[1] ?? 0);
  const uren = Number(match[2] ?? 0);
  const minuten = Number(match[3] ?? 0);
  return ((dagen * 24 + uren) * 60 + minuten) * 60_000;
}
