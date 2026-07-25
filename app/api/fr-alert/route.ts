import { NextResponse } from "next/server";
import type { FrAlertAntwoord, FrAlertMelding, FrAlertZekerheid } from "@/lib/fr-alert";

export const runtime = "nodejs";

const LIJST_URL = "https://fr-alert.gouv.fr/les-alertes";
const MAX_DETAILPAGINAS = 24;
const MAX_OUDERDOM_DAGEN = 14;
const USER_AGENT =
  "Infofrankrijk-Bosbrandenkaart/1.0 (+https://www.nederlanders.fr/bosbranden)";

export async function GET() {
  try {
    const lijstHtml = await haalTekstOp(LIJST_URL, 300);
    const links = vindAlertLinks(lijstHtml).slice(0, MAX_DETAILPAGINAS);

    if (links.length === 0) {
      return antwoord({
        beschikbaar: false,
        meldingen: [],
        bijgewerkt: new Date().toISOString(),
        bron: "FR-Alert",
        opmerking: "FR-Alert leverde tijdelijk geen leesbare meldingen.",
      });
    }

    const meldingen = await verwerkInBatches(links, 6, leesMelding);
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
    return antwoord(
      {
        beschikbaar: false,
        meldingen: [],
        bijgewerkt: null,
        bron: "FR-Alert",
        opmerking: "Officiële FR-Alert-meldingen zijn tijdelijk niet beschikbaar.",
      },
      200
    );
  }
}

function antwoord(body: FrAlertAntwoord, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
    },
  });
}

async function leesMelding(url: string): Promise<FrAlertMelding | null> {
  try {
    const html = await haalTekstOp(url, 300);
    const tekst = htmlNaarTekst(html);

    if (!/Incendie\s*-\s*Feu de forêt/i.test(tekst)) return null;
    if (/\b(?:EXERCICE|TEST D['’ ]?ALERTE)\b/i.test(tekst)) return null;

    const koppen = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
      .map((match) => htmlNaarTekst(match[1]))
      .filter(Boolean);
    const categorieIndex = koppen.findIndex((kop) => /Incendie\s*-\s*Feu de forêt/i.test(kop));
    const titel =
      koppen[categorieIndex + 1] ??
      koppen.find((kop) => /(?:feu de forêt|incendie)/i.test(kop)) ??
      "Natuurbrandmelding";
    const locatie = vindLocatie(tekst, titel);
    const coordinaten = await geocodeer(locatie, titel);
    if (!coordinaten) return null;

    const datumTijden = [...html.matchAll(/datetime=["']([^"']+)["']/gi)]
      .map((match) => normaliseerDatum(match[1]))
      .filter((waarde): waarde is string => waarde !== null);
    const begonnenOp = datumTijden[0] ?? null;
    const eindigtOp = datumTijden.length > 1 ? datumTijden[datumTijden.length - 1] : null;
    const zekerheid = vertaalZekerheid(tekst.match(/Certitude\s*:\s*([^\n]+)/i)?.[1]);
    const bron =
      tekst.match(/Source\s*:\s*([^\n]+)/i)?.[1]?.trim() || "Franse autoriteiten via FR-Alert";
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

function vindAlertLinks(html: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']*\/les-alertes\/FR-ALERT\.[^"'#?]+)["']/gi)) {
    try {
      links.add(new URL(decodeHtml(match[1]), LIJST_URL).toString());
    } catch {
      // Ongeldige link overslaan.
    }
  }
  return [...links];
}

function vindLocatie(tekst: string, titel: string): string {
  const gemarkeerdeRegel = tekst
    .split("\n")
    .map((regel) => regel.trim())
    .find((regel) => /\([PC]\d+\)\s*$/.test(regel) && regel.length < 180);

  if (gemarkeerdeRegel) return gemarkeerdeRegel.replace(/\s*\([PC]\d+\)\s*$/, "");

  const titelZonderPrefix = titel
    .replace(/^(?:alerte\s*[-–:]?\s*)?/i, "")
    .replace(/^(?:incendie|feu de forêt)\s*[-–:]?\s*/i, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
  return titelZonderPrefix || titel;
}

async function geocodeer(
  locatie: string,
  titel: string
): Promise<{ latitude: number; longitude: number } | null> {
  const pogingen = [...new Set([locatie, titel, `${locatie}, France`])].filter(Boolean);

  for (const zoektekst of pogingen) {
    const url = new URL("https://data.geopf.fr/geocodage/search");
    url.searchParams.set("q", zoektekst);
    url.searchParams.set("index", "address,poi");
    url.searchParams.set("limit", "1");

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
      };
      const coordinaten = json.features?.[0]?.geometry?.coordinates;
      if (!coordinaten) continue;
      const [longitude, latitude] = coordinaten;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      if (latitude < 41 || latitude > 52 || longitude < -6 || longitude > 10.5) continue;
      return { latitude, longitude };
    } catch {
      // Volgende zoekvariant proberen.
    }
  }

  return null;
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
  return Date.now() - Date.parse(melding.begonnenOp) <= MAX_OUDERDOM_DAGEN * 86_400_000;
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
