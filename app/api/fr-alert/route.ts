import { NextResponse } from "next/server";
import type { FrAlertAntwoord, FrAlertMelding, FrAlertZekerheid } from "@/lib/fr-alert";

export const runtime = "nodejs";

const LIJST_URLS = [
  "https://fr-alert.gouv.fr/les-alertes/33/type/Actual/all",
  "https://www.fr-alert.gouv.fr/les-alertes/33/type/Actual/all",
  "https://fr-alert.gouv.fr/les-alertes",
  "https://fr-alert.gouv.fr/tableau-alertes/2026",
] as const;
const MAX_DETAILPAGINAS = 60;
const MAX_OUDERDOM_DAGEN = 21;
const USER_AGENT =
  "Infofrankrijk-Bosbrandenkaart/1.1 (+https://www.nederlanders.fr/bosbranden)";

export async function GET() {
  try {
    const links = await haalAlertLinksOp();

    if (links.length === 0) {
      return antwoord({
        beschikbaar: false,
        meldingen: [],
        bijgewerkt: new Date().toISOString(),
        bron: "FR-Alert",
        opmerking: "FR-Alert leverde tijdelijk geen leesbare meldingen.",
      });
    }

    const meldingen = await verwerkInBatches(links.slice(0, MAX_DETAILPAGINAS), 6, leesMelding);
    const recenteMeldingen = meldingen
      .filter((melding): melding is FrAlertMelding => melding !== null)
      .filter(isRecent)
      .sort((a, b) => datumWaarde(b.begonnenOp) - datumWaarde(a.begonnenOp));

    return antwoord({
      beschikbaar: true,
      meldingen: recenteMeldingen,
      bijgewerkt: new Date().toISOString(),
      bron: "FR-Alert",
      opmerking:
        recenteMeldingen.length === 0
          ? "FR-Alert bevat momenteel geen recente, geografisch plaatsbare natuurbrandmelding."
          : undefined,
    });
  } catch (fout) {
    console.error("FR-Alert ophalen mislukt", fout);
    return antwoord({
      beschikbaar: false,
      meldingen: [],
      bijgewerkt: null,
      bron: "FR-Alert",
      opmerking: "Officiële FR-Alert-meldingen zijn tijdelijk niet beschikbaar.",
    });
  }
}

function antwoord(body: FrAlertAntwoord, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}

async function haalAlertLinksOp(): Promise<string[]> {
  const links = new Set<string>();

  for (const lijstUrl of LIJST_URLS) {
    try {
      const html = await haalTekstOp(lijstUrl, 120);
      for (const link of vindAlertLinks(html, lijstUrl)) links.add(link);
      if (links.size >= 20) break;
    } catch (fout) {
      console.warn("FR-Alert-lijst overgeslagen", lijstUrl, fout);
    }
  }

  return [...links];
}

async function leesMelding(url: string): Promise<FrAlertMelding | null> {
  try {
    const html = await haalTekstOp(url, 120);
    const tekst = htmlNaarTekst(html);

    if (!/Incendie\s*[-–]\s*Feu de forêt/i.test(tekst)) return null;
    if (/\b(?:EXERCICE|TEST D['’ ]?ALERTE|MESSAGE DE TEST)\b/i.test(tekst)) return null;

    const koppen = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
      .map((match) => htmlNaarTekst(match[1]))
      .filter(Boolean);
    const categorieIndex = koppen.findIndex((kop) =>
      /Incendie\s*[-–]\s*Feu de forêt/i.test(kop)
    );
    const titel =
      koppen[categorieIndex + 1] ??
      koppen.find((kop) => /(?:feu de forêt|incendie)/i.test(kop)) ??
      "Natuurbrandmelding";
    const locatie = vindLocatie(tekst, titel);
    const coordinaten = vindCoordinatenInHtml(html) ?? (await geocodeer(locatie, titel));
    if (!coordinaten) return null;

    const datumTijden = vindDatumTijden(html, tekst);
    const begonnenOp = datumTijden[0] ?? null;
    const eindigtOp = datumTijden.length > 1 ? datumTijden[datumTijden.length - 1] : null;
    const zekerheid = vertaalZekerheid(tekst.match(/Certitude\s*:\s*([^\n]+)/i)?.[1]);
    const bron =
      tekst.match(/Source\s*:\s*([^\n]+)/i)?.[1]?.trim() ||
      "Franse autoriteiten via FR-Alert";
    const id = url.split("/").pop() || url;

    return {
      id,
      titel: schoon(titel),
      locatie: schoon(locatie),
      latitude: coordinaten.latitude,
      longitude: coordinaten.longitude,
      zekerheid,
      bron: schoon(bron),
      begonnenOp,
      eindigtOp,
      actief: eindigtOp ? Date.parse(eindigtOp) > Date.now() : true,
      url,
    };
  } catch (fout) {
    console.warn("FR-Alert-detail overgeslagen", url, fout);
    return null;
  }
}

function vindAlertLinks(html: string, basisUrl: string): string[] {
  const links = new Set<string>();
  const patronen = [
    /href=["']([^"']*\/les-alertes\/FR-ALERT\.[^"'#?\s<]+)["']/gi,
    /href=["']([^"']*FR-ALERT\.[^"'#?\s<]+)["']/gi,
  ];

  for (const patroon of patronen) {
    for (const match of html.matchAll(patroon)) {
      try {
        const kandidaat = decodeHtml(match[1]);
        const url = new URL(kandidaat, basisUrl);
        if (!url.pathname.includes("/les-alertes/FR-ALERT.")) continue;
        links.add(url.toString());
      } catch {
        // Ongeldige link overslaan.
      }
    }
  }

  return [...links];
}

function vindLocatie(tekst: string, titel: string): string {
  const regels = tekst
    .split("\n")
    .map((regel) => regel.trim())
    .filter(Boolean);

  const gemarkeerdeRegel = regels.find(
    (regel) => /\([PC]\d+\)\s*$/.test(regel) && regel.length < 220
  );

  if (gemarkeerdeRegel) return gemarkeerdeRegel.replace(/\s*\([PC]\d+\)\s*$/, "");

  const gemeenteRegel = regels.find(
    (regel) => /^(?:Commune|Communes|Secteur|Presqu['’]île|Forêt|Massif|Département)\b/i.test(regel) && regel.length < 220
  );
  if (gemeenteRegel) return gemeenteRegel;

  const titelZonderPrefix = titel
    .replace(/^(?:alerte\s*[-–:]?\s*)?/i, "")
    .replace(/^(?:incendie|feu de forêt)\s*[-–:]?\s*/i, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
  return titelZonderPrefix || titel;
}

function vindCoordinatenInHtml(
  html: string
): { latitude: number; longitude: number } | null {
  const dataMatch = html.match(
    /data-(?:lat|latitude)=["'](-?\d+(?:\.\d+)?)["'][\s\S]{0,300}?data-(?:lon|lng|longitude)=["'](-?\d+(?:\.\d+)?)["']/i
  );
  if (dataMatch) {
    const latitude = Number(dataMatch[1]);
    const longitude = Number(dataMatch[2]);
    if (geldigeMetropoleCoordinaat(latitude, longitude)) return { latitude, longitude };
  }

  const jsonMatch = html.match(
    /["']latitude["']\s*:\s*(-?\d+(?:\.\d+)?)[\s\S]{0,250}?["']longitude["']\s*:\s*(-?\d+(?:\.\d+)?)/i
  );
  if (jsonMatch) {
    const latitude = Number(jsonMatch[1]);
    const longitude = Number(jsonMatch[2]);
    if (geldigeMetropoleCoordinaat(latitude, longitude)) return { latitude, longitude };
  }

  const geoJsonMatch = html.match(
    /["']coordinates["']\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/i
  );
  if (geoJsonMatch) {
    const longitude = Number(geoJsonMatch[1]);
    const latitude = Number(geoJsonMatch[2]);
    if (geldigeMetropoleCoordinaat(latitude, longitude)) return { latitude, longitude };
  }

  return null;
}

async function geocodeer(
  locatie: string,
  titel: string
): Promise<{ latitude: number; longitude: number } | null> {
  const pogingen = maakZoekPogingen(locatie, titel);

  for (const zoektekst of pogingen) {
    const geopf = await geocodeerMetGeopf(zoektekst);
    if (geopf) return geopf;
  }

  for (const zoektekst of pogingen) {
    const gemeente = await geocodeerGemeente(zoektekst);
    if (gemeente) return gemeente;
  }

  return null;
}

function maakZoekPogingen(locatie: string, titel: string): string[] {
  const opgeschoond = locatie
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:Commune|Communes|Secteur|Département|Massif|Forêt|Presqu['’]île)\s+(?:de|du|des|d['’])?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const delen = opgeschoond
    .split(/\s+(?:et|ou)\s+|[,/;]|\s+-\s+/i)
    .map((deel) => deel.trim())
    .filter((deel) => deel.length >= 3 && deel.length <= 100);

  return [...new Set([locatie, opgeschoond, ...delen, titel, `${opgeschoond}, France`])].filter(
    Boolean
  );
}

async function geocodeerMetGeopf(
  zoektekst: string
): Promise<{ latitude: number; longitude: number } | null> {
  const url = new URL("https://data.geopf.fr/geocodage/search");
  url.searchParams.set("q", zoektekst);
  url.searchParams.set("limit", "5");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };

    for (const feature of json.features ?? []) {
      const coordinaten = feature.geometry?.coordinates;
      if (!coordinaten) continue;
      const [longitude, latitude] = coordinaten;
      if (geldigeMetropoleCoordinaat(latitude, longitude)) return { latitude, longitude };
    }
  } catch {
    return null;
  }

  return null;
}

async function geocodeerGemeente(
  zoektekst: string
): Promise<{ latitude: number; longitude: number } | null> {
  const naam = zoektekst
    .replace(/,?\s*France$/i, "")
    .replace(/\b(?:commune|communes|secteur|département)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!naam || naam.length > 100) return null;

  const url = new URL("https://geo.api.gouv.fr/communes");
  url.searchParams.set("nom", naam);
  url.searchParams.set("fields", "nom,centre");
  url.searchParams.set("format", "json");
  url.searchParams.set("geometry", "centre");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{
      centre?: { coordinates?: [number, number] };
    }>;
    const coordinaten = json[0]?.centre?.coordinates;
    if (!coordinaten) return null;
    const [longitude, latitude] = coordinaten;
    return geldigeMetropoleCoordinaat(latitude, longitude) ? { latitude, longitude } : null;
  } catch {
    return null;
  }
}

function geldigeMetropoleCoordinaat(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 41 &&
    latitude <= 52 &&
    longitude >= -6 &&
    longitude <= 10.5
  );
}

function vindDatumTijden(html: string, tekst: string): string[] {
  const resultaat = new Set<string>();

  for (const match of html.matchAll(/datetime=["']([^"']+)["']/gi)) {
    const iso = normaliseerDatum(match[1]);
    if (iso) resultaat.add(iso);
  }

  for (const match of tekst.matchAll(
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\s*,?\s*(\d{1,2})h(\d{2})/gi
  )) {
    const iso = normaliseerFranseDatum(match[1], match[2], match[3], match[4], match[5]);
    if (iso) resultaat.add(iso);
  }

  return [...resultaat].sort((a, b) => Date.parse(a) - Date.parse(b));
}

function normaliseerFranseDatum(
  dagTekst: string,
  maandTekst: string,
  jaarTekst: string,
  uurTekst: string,
  minuutTekst: string
): string | null {
  const maanden: Record<string, number> = {
    janvier: 1,
    février: 2,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    août: 8,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    décembre: 12,
    decembre: 12,
  };
  const maand = maanden[maandTekst.toLowerCase()];
  if (!maand) return null;
  const jaar = Number(jaarTekst);
  const offset = maand >= 4 && maand <= 10 ? "+02:00" : "+01:00";
  const iso = `${jaar}-${String(maand).padStart(2, "0")}-${String(Number(dagTekst)).padStart(
    2,
    "0"
  )}T${String(Number(uurTekst)).padStart(2, "0")}:${String(Number(minuutTekst)).padStart(
    2,
    "0"
  )}:00${offset}`;
  return normaliseerDatum(iso);
}

async function haalTekstOp(url: string, revalidate: number): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fr-FR,fr;q=0.9,nl;q=0.7",
    },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`${url} antwoordde met status ${res.status}`);
  return res.text();
}

function htmlNaarTekst(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/h[1-6]>|<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtml(waarde: string): string {
  const benoemd: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    eacute: "é",
    Eacute: "É",
    egrave: "è",
    agrave: "à",
    ecirc: "ê",
    ocirc: "ô",
    rsquo: "’",
    ndash: "–",
  };

  return waarde.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (geheel, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return benoemd[code] ?? geheel;
  });
}

function vertaalZekerheid(waarde?: string): FrAlertZekerheid {
  const v = waarde?.toLowerCase() ?? "";
  if (v.includes("observ")) return "waargenomen";
  if (v.includes("probable")) return "waarschijnlijk";
  return "onbekend";
}

function normaliseerDatum(waarde: string): string | null {
  const datum = new Date(waarde);
  return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
}

function isRecent(melding: FrAlertMelding): boolean {
  if (!melding.begonnenOp) return true;
  const tijd = Date.parse(melding.begonnenOp);
  if (!Number.isFinite(tijd)) return true;
  return Date.now() - tijd <= MAX_OUDERDOM_DAGEN * 86_400_000;
}

function datumWaarde(waarde: string | null): number {
  if (!waarde) return 0;
  const tijd = Date.parse(waarde);
  return Number.isFinite(tijd) ? tijd : 0;
}

function schoon(waarde: string): string {
  return waarde.replace(/\s+/g, " ").trim();
}

async function verwerkInBatches<T, R>(
  invoer: T[],
  batchGrootte: number,
  verwerker: (item: T) => Promise<R>
): Promise<R[]> {
  const resultaat: R[] = [];
  for (let i = 0; i < invoer.length; i += batchGrootte) {
    const batch = invoer.slice(i, i + batchGrootte);
    resultaat.push(...(await Promise.all(batch.map(verwerker))));
  }
  return resultaat;
}
