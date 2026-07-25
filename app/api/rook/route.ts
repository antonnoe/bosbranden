import { NextRequest } from "next/server";

export const runtime = "nodejs";

const WMS_URL = "https://eccharts.ecmwf.int/wms/";
const LAAG = "composition_europe_pm_wf_forecast_surface";
const BBOX = "41.33374,-5.14127657354623,51.088394,9.559807";
const TOEGESTANE_UREN = new Set([0, 6, 12, 24]);
const MAX_AFWIJKING_UREN = 2.1;
const MAX_VERTRAGING_UREN = 3;

interface TijdInfo {
  gevraagdUur: number;
  doel: string;
  gekozen: string;
  eersteBeschikbaar: string;
  laatsteBeschikbaar: string;
  afwijkingUren: number;
  verouderd: boolean;
  beschikbaar: boolean;
  toelichting: string;
}

export async function GET(request: NextRequest) {
  const legenda = request.nextUrl.searchParams.get("legenda") === "1";
  const metadata = request.nextUrl.searchParams.get("meta") === "1";

  try {
    if (legenda) return await haalLegendaOp();

    const gevraagd = Number(request.nextUrl.searchParams.get("uur") ?? "0");
    const uren = TOEGESTANE_UREN.has(gevraagd) ? gevraagd : 0;
    const tijdInfo = await bepaalTijdInfo(uren);

    if (metadata) return metadataAntwoord(tijdInfo);

    if (!tijdInfo.beschikbaar) {
      return new Response("Actuele CAMS-rookverwachting is tijdelijk niet beschikbaar.", {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-CAMS-Valid-Time": tijdInfo.gekozen,
          "X-CAMS-Latest-Time": tijdInfo.laatsteBeschikbaar,
        },
      });
    }

    const afbeelding = await haalKaartOp(tijdInfo.gekozen);
    const contentType = afbeelding.headers.get("content-type") ?? "";

    if (!afbeelding.ok || !contentType.toLowerCase().startsWith("image/")) {
      const fouttekst = await afbeelding.text();
      console.error(
        "CAMS WMS-kaart niet beschikbaar",
        afbeelding.status,
        contentType,
        fouttekst.slice(0, 500)
      );
      return new Response("Rookverwachting tijdelijk niet beschikbaar.", { status: 502 });
    }

    return new Response(await afbeelding.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/png",
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
        "X-CAMS-Valid-Time": tijdInfo.gekozen,
        "X-CAMS-Latest-Time": tijdInfo.laatsteBeschikbaar,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (fout) {
    console.error("CAMS rooklaag ophalen mislukt", fout);

    if (metadata) {
      return Response.json(
        {
          beschikbaar: false,
          verouderd: false,
          gevraagdUur: 0,
          geldigVoor: null,
          eersteBeschikbaar: null,
          laatsteBeschikbaar: null,
          afwijkingUren: null,
          laag: LAAG,
          eenheid: "µg/m³",
          laagsteKlasse: "0–2 µg/m³",
          toelichting: "De actuele CAMS-modeltijden konden tijdelijk niet worden opgehaald.",
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return new Response("Rookverwachting tijdelijk niet beschikbaar.", { status: 502 });
  }
}

function metadataAntwoord(info: TijdInfo) {
  return Response.json(
    {
      beschikbaar: info.beschikbaar,
      verouderd: info.verouderd,
      gevraagdUur: info.gevraagdUur,
      geldigVoor: info.gekozen,
      eersteBeschikbaar: info.eersteBeschikbaar,
      laatsteBeschikbaar: info.laatsteBeschikbaar,
      afwijkingUren: Number(info.afwijkingUren.toFixed(1)),
      laag: LAAG,
      eenheid: "µg/m³",
      laagsteKlasse: "0–2 µg/m³",
      toelichting: info.toelichting,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

async function haalKaartOp(tijd: string): Promise<Response> {
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
  url.searchParams.set("time", tijd);

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
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.3.0");
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

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.toLowerCase().startsWith("image/")) {
    return new Response("Legenda niet beschikbaar.", { status: 502 });
  }

  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": contentType || "image/png",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function bepaalTijdInfo(urenVooruit: number): Promise<TijdInfo> {
  const tijden = await haalBeschikbareTijdenOp();
  if (tijden.length === 0) throw new Error("Geen tijdstappen voor de CAMS-rooklaag gevonden.");

  const nu = Date.now();
  const doelDatum = new Date(nu);
  doelDatum.setUTCMinutes(0, 0, 0);
  doelDatum.setUTCHours(doelDatum.getUTCHours() + urenVooruit);
  const doelMs = doelDatum.getTime();

  let gekozen = tijden[0];
  let verschilMs = Math.abs(Date.parse(gekozen) - doelMs);
  for (const tijd of tijden.slice(1)) {
    const nieuwVerschil = Math.abs(Date.parse(tijd) - doelMs);
    if (nieuwVerschil < verschilMs) {
      gekozen = tijd;
      verschilMs = nieuwVerschil;
    }
  }

  const eersteBeschikbaar = tijden[0];
  const laatsteBeschikbaar = tijden[tijden.length - 1];
  const laatsteMs = Date.parse(laatsteBeschikbaar);
  const afwijkingUren = verschilMs / 3_600_000;
  const verouderd = laatsteMs < nu - MAX_VERTRAGING_UREN * 3_600_000;
  const beschikbaar = !verouderd && afwijkingUren <= MAX_AFWIJKING_UREN;

  let toelichting =
    "Actuele CAMS-modeltijd gevonden. Lichtblauw is de laagste klasse en betekent geen of zeer weinig voorspelde natuurbrand-PM10 op leefniveau.";

  if (verouderd) {
    toelichting = `De publieke CAMS-WMS levert voor deze laag momenteel alleen modeltijden tot ${laatsteBeschikbaar}. Deze data zijn te oud en worden daarom niet als actuele rookverwachting getoond.`;
  } else if (afwijkingUren > MAX_AFWIJKING_UREN) {
    toelichting = `Voor het gekozen tijdstip is geen voldoende nabije CAMS-modeltijd beschikbaar. De dichtstbijzijnde tijd is ${gekozen}.`;
  }

  return {
    gevraagdUur: urenVooruit,
    doel: doelDatum.toISOString().replace(".000Z", "Z"),
    gekozen,
    eersteBeschikbaar,
    laatsteBeschikbaar,
    afwijkingUren,
    verouderd,
    beschikbaar,
    toelichting,
  };
}

async function haalBeschikbareTijdenOp(): Promise<string[]> {
  const url = new URL(WMS_URL);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("token", "public");
  url.searchParams.set("request", "GetCapabilities");
  url.searchParams.set("version", "1.3.0");

  const res = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.2",
      "User-Agent": "Infofrankrijk-Bosbrandenkaart/1.0",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`GetCapabilities antwoordde met status ${res.status}`);
  const xml = await res.text();
  const scopes = vindLaagScopes(xml, LAAG);
  if (scopes.length === 0) throw new Error("CAMS-rooklaag ontbreekt in GetCapabilities.");

  for (const scope of scopes) {
    const metadata = directeLaagMetadata(scope);
    const match = metadata.match(
      /<(?:Dimension|Extent)\b[^>]*name=["']time["'][^>]*>([\s\S]*?)<\/(?:Dimension|Extent)>/i
    );
    if (!match) continue;

    const tijden = parseerTijdsdimensie(decodeXml(match[1]));
    if (tijden.length > 0) return tijden;
  }

  throw new Error("De tijdsdimensie van de CAMS-rooklaag ontbreekt.");
}

function vindLaagScopes(xml: string, laag: string): string[] {
  const naamRegex = new RegExp(`<Name>\\s*${escapeRegExp(laag)}\\s*<\\/Name>`, "i");
  const naamMatch = naamRegex.exec(xml);
  if (!naamMatch || naamMatch.index === undefined) return [];

  const naamIndex = naamMatch.index;
  const tagRegex = /<\/?Layer\b[^>]*>/gi;
  const openingen: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml))) {
    if (match.index >= naamIndex) break;
    if (/^<\/Layer/i.test(match[0])) openingen.pop();
    else openingen.push(match.index);
  }

  return [...openingen]
    .reverse()
    .map((start) => knipLayerBlok(xml, start))
    .filter((waarde): waarde is string => Boolean(waarde));
}

function knipLayerBlok(xml: string, start: number): string | null {
  const tagRegex = /<\/?Layer\b[^>]*>/gi;
  tagRegex.lastIndex = start;
  let diepte = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(xml))) {
    if (/^<\/Layer/i.test(match[0])) diepte -= 1;
    else diepte += 1;

    if (diepte === 0) return xml.slice(start, tagRegex.lastIndex);
  }

  return null;
}

function directeLaagMetadata(scope: string): string {
  const openEinde = scope.indexOf(">");
  if (openEinde < 0) return scope;
  const kindIndex = scope.search(/<Layer\b/i);
  const eersteKind = scope.slice(openEinde + 1).search(/<Layer\b/i);
  if (kindIndex < 0 || eersteKind < 0) return scope;
  return scope.slice(0, openEinde + 1 + eersteKind);
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

      for (let tijd = begin; tijd <= einde && resultaat.size < 1000; tijd += stap) {
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

function decodeXml(waarde: string): string {
  return waarde
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(waarde: string): string {
  return waarde.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
