import { NextResponse } from "next/server";
import type { FrAlertAntwoord, FrAlertMelding, FrAlertZekerheid } from "@/lib/fr-alert";
import {
  FR_ALERT_FALLBACK,
  FR_ALERT_FALLBACK_BIJGEWERKT,
} from "@/data/fr-alert-fallback";
import { frAlertAgent, httpsTekst } from "@/lib/fr-alert-tls";

export const runtime = "nodejs";

const JAAR = new Date().getUTCFullYear();
const LIJST_URLS = [
  "https://fr-alert.gouv.fr/les-alertes",
  "https://www.fr-alert.gouv.fr/les-alertes",
  "https://fr-alert.gouv.fr/les-alertes/33/type/Actual/all",
  "https://www.fr-alert.gouv.fr/les-alertes/33/type/Actual/all",
  `https://fr-alert.gouv.fr/tableau-alertes/${JAAR}`,
  "https://fr-alert.gouv.fr/",
] as const;

const MAX_DETAILPAGINAS = 60;
const MAX_OUDERDOM_DAGEN = 21;
const MAX_FALLBACK_DAGEN = 45;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

export async function GET() {
  const nu = new Date().toISOString();

  try {
    const ids = await haalAlertIdsOp();
    const liveResultaten =
      ids.length > 0
        ? await verwerkInBatches(ids.slice(0, MAX_DETAILPAGINAS), 5, leesMelding)
        : [];

    const live = liveResultaten
      .filter((melding): melding is FrAlertMelding => melding !== null)
      .filter(isRecent);

    const fallback = haalFallbackMeldingenOp();
    const gecombineerd = combineerMeldingen(live, fallback).sort(
      (a, b) => datumWaarde(b.begonnenOp) - datumWaarde(a.begonnenOp)
    );

    if (gecombineerd.length > 0) {
      const liveBron = live.length > 0;
      return antwoord({
        beschikbaar: true,
        meldingen: gecombineerd,
        bijgewerkt: liveBron ? nu : FR_ALERT_FALLBACK_BIJGEWERKT,
        bron: "FR-Alert",
        liveBron,
        momentopnameVan: liveBron ? null : FR_ALERT_FALLBACK_BIJGEWERKT,
        opmerking: liveBron
          ? undefined
          : "De live FR-Alert-pagina was tijdelijk niet uitleesbaar; hieronder staat de laatst bekende officiële stand, geen actuele situatie.",
      });
    }

    return antwoord({
      beschikbaar: false,
      meldingen: [],
      bijgewerkt: null,
      bron: "FR-Alert",
      liveBron: false,
      momentopnameVan: null,
      opmerking: "FR-Alert leverde tijdelijk geen bruikbare natuurbrandmeldingen.",
    });
  } catch (fout) {
    console.error("FR-Alert ophalen mislukt", fout);
    const fallback = haalFallbackMeldingenOp();

    return antwoord({
      beschikbaar: fallback.length > 0,
      meldingen: fallback,
      bijgewerkt: fallback.length > 0 ? FR_ALERT_FALLBACK_BIJGEWERKT : null,
      bron: "FR-Alert",
      liveBron: false,
      momentopnameVan: fallback.length > 0 ? FR_ALERT_FALLBACK_BIJGEWERKT : null,
      opmerking:
        fallback.length > 0
          ? "De live FR-Alert-pagina was tijdelijk niet uitleesbaar; hieronder staat de laatst bekende officiële stand, geen actuele situatie."
          : "Officiële FR-Alert-meldingen zijn tijdelijk niet beschikbaar.",
    });
  }
}

function antwoord(body: FrAlertAntwoord, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=900",
    },
  });
}

async function haalAlertIdsOp(): Promise<string[]> {
  const ids = new Set<string>();

  for (const lijstUrl of LIJST_URLS) {
    try {
      const html = await haalTekstOp(lijstUrl, 120);
      for (const id of vindAlertIds(html)) ids.add(id);
      if (ids.size >= 20) break;
    } catch (fout) {
      console.warn("FR-Alert-lijst overgeslagen", lijstUrl, fout);
    }
  }

  return [...ids].sort((a, b) => tijdUitIdentifiant(b) - tijdUitIdentifiant(a));
}

function vindAlertIds(html: string): string[] {
  const ids = new Set<string>();
  const varianten = [
    html,
    decodeHtml(html),
    html
      .replace(/\\u002e/gi, ".")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/"),
  ];

  for (const variant of varianten) {
    const gedecodeerd = veiligDecodeURIComponent(variant);
    for (const bron of [variant, gedecodeerd]) {
      for (const match of bron.matchAll(
        /FR-ALERT(?:\.|%2e)(\d{6,})(?:\.|%2e)(\d+)(?:\.|%2e)(\d+)/gi
      )) {
        ids.add(`FR-ALERT.${match[1]}.${match[2]}.${match[3]}`);
      }
    }
  }

  return [...ids];
}

async function leesMelding(id: string): Promise<FrAlertMelding | null> {
  const urls = [
    `https://fr-alert.gouv.fr/les-alertes/${id}`,
    `https://www.fr-alert.gouv.fr/les-alertes/${id}`,
  ];

  for (const url of urls) {
    try {
      const html = await haalTekstOp(url, 120);
      const melding = await parseMelding(id, url, html);
      if (melding) return melding;
    } catch (fout) {
      console.warn("FR-Alert-detailvariant overgeslagen", url, fout);
    }
  }

  return null;
}

async function parseMelding(
  id: string,
  url: string,
  html: string
): Promise<FrAlertMelding | null> {
  const tekst = htmlNaarTekst(html);

  if (!/\bIncendie\b/i.test(tekst) || !/Feu de forêt/i.test(tekst)) return null;
  if (
    /\b(?:EXERCICE|TEST D['’ ]?ALERTE|MESSAGE DE TEST|FR-ALERT EXERCICE)\b/i.test(
      tekst
    )
  ) {
    return null;
  }

  const titel = vindTitel(html, tekst);
  const locatie = vindLocatie(tekst, titel);
  const coordinaten = vindCoordinatenInHtml(html) ?? (await geocodeer(locatie, titel));
  if (!coordinaten) return null;

  const datumTijden = vindDatumTijden(html, tekst);
  const begonnenOp = datumTijden[0] ?? datumUitIdentifiant(id);
  const eindigtOp = datumTijden.length > 1 ? datumTijden[datumTijden.length - 1] : null;
  const zekerheid = vertaalZekerheid(
    tekst.match(/Certitude\s*:\s*([^\n]+)/i)?.[1]
  );
  const bron =
    tekst.match(/Source\s*:\s*([^\n]+)/i)?.[1]?.trim() ||
    "Franse autoriteiten via FR-Alert";

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
}

// Robuuste titelbepaling. De detailpagina levert de titel niet altijd meer als
// <h>-kop; een natuurbrandtitel begint echter betrouwbaar met "Feu de Forêt
// <plaats>". We verzamelen kandidaten uit koppen, <title>, og:title, ingebedde
// JSON-waarden en de zichtbare tekst, en kiezen de meest specifieke.
function vindTitel(html: string, tekst: string): string {
  const kandidaten: string[] = [];

  // 1. Zichtbare koppen (oude methode blijft eerste keus).
  const koppen = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
    .map((match) => htmlNaarTekst(match[1]))
    .filter(Boolean);
  const categorieIndex = koppen.findIndex(
    (kop) => /\bIncendie\b/i.test(kop) && /Feu de forêt/i.test(kop)
  );
  if (categorieIndex >= 0 && koppen[categorieIndex + 1]) {
    kandidaten.push(koppen[categorieIndex + 1]);
  }
  kandidaten.push(...koppen);

  // 2. <title> en og:title.
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (titleTag) kandidaten.push(htmlNaarTekst(titleTag));
  const og =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];
  if (og) kandidaten.push(htmlNaarTekst(og));

  // 3. Ingebedde JSON-waarden "Feu de Forêt …".
  for (const match of decodeHtml(html).matchAll(
    /"((?:Feu|Incendie)[^"\\]{0,90})"/gi
  )) {
    kandidaten.push(match[1]);
  }
  // 4. Zichtbare tekst als laatste redmiddel.
  for (const match of tekst.matchAll(/Feu de For[êe]ts?\b[^\n{}<>"]{2,90}/gi)) {
    kandidaten.push(match[0]);
  }

  const opgeschoond = kandidaten
    .map((k) =>
      schoon(k)
        .replace(/^\s*fr[- ]?alert\s*[-–|:]\s*/i, "")
        .replace(/\s*[-–|]\s*fr[- ]?alert\s*$/i, "")
        .trim()
    )
    .filter(Boolean);

  // Voorkeur: specifieke "Feu de Forêt <plaats>", niet de kale categorie.
  const specifiek = opgeschoond.find(
    (k) =>
      /feu de for[êe]t/i.test(k) &&
      !/^incendie\b/i.test(k) &&
      k.replace(/feu de for[êe]ts?/i, "").replace(/[()\s.,;:–-]/g, "").length >= 3 &&
      k.length <= 140
  );
  if (specifiek) return specifiek;

  const kop = opgeschoond.find((k) => k.length >= 4 && !/^incendie\b/i.test(k));
  return kop ?? "Natuurbrandmelding";
}

function vindLocatie(tekst: string, titel: string): string {
  const regels = tekst
    .split("\n")
    .map((regel) => regel.trim())
    .filter(Boolean);

  const gemarkeerdeRegel = regels.find(
    (regel) => /\([PC]\d+\)\s*$/.test(regel) && regel.length < 240
  );
  if (gemarkeerdeRegel) {
    return gemarkeerdeRegel.replace(/\s*\([PC]\d+\)\s*$/, "");
  }

  const gemeenteRegel = regels.find(
    (regel) =>
      /^(?:Commune|Communes|Secteur|Presqu['’]île|Forêt|Massif|Département|Bassin)\b/i.test(
        regel
      ) && regel.length < 240
  );
  if (gemeenteRegel) return gemeenteRegel;

  return titel
    .replace(/^(?:alerte\s*[-–:]?\s*)?/i, "")
    .replace(/^(?:incendie|feu de forêt)\s*[-–:]?\s*/i, "")
    .replace(/^\((.*)\)$/, "$1")
    .trim();
}

function vindCoordinatenInHtml(
  html: string
): { latitude: number; longitude: number } | null {
  const genormaliseerd = decodeHtml(
    html
      .replace(/\\u002c/gi, ",")
      .replace(/\\u002e/gi, ".")
      .replace(/\\u002d/gi, "-")
      .replace(/\\\//g, "/")
  );

  const punten: Array<{ latitude: number; longitude: number }> = [];
  for (const match of genormaliseerd.matchAll(
    /(-?\d{1,3}(?:\.\d{4,}))\s*,\s*(-?\d{1,3}(?:\.\d{4,}))/g
  )) {
    const eerste = Number(match[1]);
    const tweede = Number(match[2]);

    if (geldigeMetropoleCoordinaat(eerste, tweede)) {
      punten.push({ latitude: eerste, longitude: tweede });
    } else if (geldigeMetropoleCoordinaat(tweede, eerste)) {
      punten.push({ latitude: tweede, longitude: eerste });
    }
  }

  if (punten.length === 0) return null;

  return {
    latitude: mediaan(punten.map((punt) => punt.latitude)),
    longitude: mediaan(punten.map((punt) => punt.longitude)),
  };
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
    .replace(
      /\b(?:Commune|Communes|Secteur|Département|Massif|Forêt|Presqu['’]île|Bassin)\s+(?:de|du|des|d['’])?\s*/gi,
      " "
    )
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
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
    };

    for (const feature of json.features ?? []) {
      const coordinaten = feature.geometry?.coordinates;
      if (!coordinaten) continue;
      const [longitude, latitude] = coordinaten;
      if (geldigeMetropoleCoordinaat(latitude, longitude)) {
        return { latitude, longitude };
      }
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
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as Array<{
      centre?: { coordinates?: [number, number] };
    }>;
    const coordinaten = json[0]?.centre?.coordinates;
    if (!coordinaten) return null;
    const [longitude, latitude] = coordinaten;
    return geldigeMetropoleCoordinaat(latitude, longitude)
      ? { latitude, longitude }
      : null;
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
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\s*,?\s*(\d{1,2})h(\d{2})/gi
  )) {
    const iso = normaliseerFranseDatum(
      match[1],
      match[2],
      match[3],
      match[4],
      match[5]
    );
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

  const offset = maand >= 4 && maand <= 10 ? "+02:00" : "+01:00";
  const iso = `${jaarTekst}-${String(maand).padStart(2, "0")}-${String(
    Number(dagTekst)
  ).padStart(2, "0")}T${String(Number(uurTekst)).padStart(2, "0")}:${String(
    Number(minuutTekst)
  ).padStart(2, "0")}:00${offset}`;

  return normaliseerDatum(iso);
}

// FR-Alert stuurt een onvolledige certificaatketen; we gebruiken daarom een
// https.Agent die het ontbrekende intermediate aanvult (zie lib/fr-alert-tls).
// De revalidate-parameter is behouden voor de aanroepers maar niet meer nodig:
// de route cachet via de Cache-Control-header.
async function haalTekstOp(url: string, _revalidate: number): Promise<string> {
  const agent = await frAlertAgent(new URL(url).hostname);
  const { status, body } = await httpsTekst(url, agent, {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,nl;q=0.7,en;q=0.5",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "https://fr-alert.gouv.fr/",
  });

  if (status < 200 || status >= 300) {
    throw new Error(`${url} antwoordde met status ${status}`);
  }
  if (body.length < 200) {
    throw new Error(`${url} leverde een onvolledige respons`);
  }
  return body;
}

function htmlNaarTekst(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/h[1-6]>|<\/div>|<\/article>|<\/section>/gi, "\n")
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
    if (code.toLowerCase().startsWith("#x")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(parseInt(code.slice(1), 10));
    }
    return benoemd[code] ?? geheel;
  });
}

function veiligDecodeURIComponent(waarde: string): string {
  try {
    return decodeURIComponent(waarde);
  } catch {
    return waarde;
  }
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

function datumUitIdentifiant(id: string): string | null {
  const tijd = tijdUitIdentifiant(id);
  return tijd > 0 ? new Date(tijd).toISOString() : null;
}

function tijdUitIdentifiant(id: string): number {
  const seconden = Number(id.split(".")[1]);
  return Number.isFinite(seconden) ? seconden * 1000 : 0;
}

function isRecent(melding: FrAlertMelding): boolean {
  if (!melding.begonnenOp) return true;
  const tijd = Date.parse(melding.begonnenOp);
  return (
    !Number.isFinite(tijd) ||
    Date.now() - tijd <= MAX_OUDERDOM_DAGEN * 86_400_000
  );
}

function haalFallbackMeldingenOp(): FrAlertMelding[] {
  const grens = Date.now() - MAX_FALLBACK_DAGEN * 86_400_000;

  return FR_ALERT_FALLBACK
    .filter((melding) => {
      if (!melding.begonnenOp) return true;
      const tijd = Date.parse(melding.begonnenOp);
      return !Number.isFinite(tijd) || tijd >= grens;
    })
    .map((melding) => ({
      ...melding,
      actief: melding.eindigtOp ? Date.parse(melding.eindigtOp) > Date.now() : true,
    }))
    .sort((a, b) => datumWaarde(b.begonnenOp) - datumWaarde(a.begonnenOp));
}

function combineerMeldingen(
  live: FrAlertMelding[],
  fallback: FrAlertMelding[]
): FrAlertMelding[] {
  const gecombineerd = new Map<string, FrAlertMelding>();
  for (const melding of fallback) gecombineerd.set(melding.id, melding);
  for (const melding of live) gecombineerd.set(melding.id, melding);
  return [...gecombineerd.values()].filter(isRecent);
}

function datumWaarde(waarde: string | null): number {
  if (!waarde) return 0;
  const tijd = Date.parse(waarde);
  return Number.isFinite(tijd) ? tijd : 0;
}

function mediaan(waarden: number[]): number {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 === 0
    ? (gesorteerd[midden - 1] + gesorteerd[midden]) / 2
    : gesorteerd[midden];
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
