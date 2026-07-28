// Pure, framework-vrije logica voor het automatische nieuws: feed-parsing,
// host-allowlist, datumpoort en trefwoordfilter. Geen Next- of React-import,
// zodat deze functies los te testen zijn (zie scripts/test-nieuws.ts).

import type { BronSoort, Nieuwsbron } from "@/data/nieuwsbronnen";

// ---- Gedeeld antwoordmodel (server → client) -------------------------------
export interface EcosystemLink {
  label: string;
  url: string;
}

export interface NieuwsItem {
  titel: string; // oorspronkelijke (Franse) kop
  url: string;
  bron: string; // naam van de bron uit het bronnenbestand
  soort: BronSoort;
  paywall: boolean;
  gepubliceerdOp: string; // ISO; items zonder bruikbare datum bestaan niet
  // Nederlandse vertaling (H). Server-side ingevuld via de samenvatdienst.
  titelNl?: string | null; // Nederlandse kop, afgeleid uit de samenvatting
  samenvatting?: string | null; // volledige Nederlandse samenvatting (markdown)
  ecosystemLinks?: EcosystemLink[]; // gerelateerde links van de dienst
  vertaling?: "ok" | "mislukt"; // of de samenvatting lukte (H5)
}

export interface BronStatus {
  naam: string;
  soort: BronSoort;
  regio: string;
  bevestigd: boolean;
  ok: boolean; // slaagde de laatste ophaalpoging?
  aantal: number; // aantal getoonde items uit deze bron
  tijdstip: string | null; // ISO van de ophaalpoging
}

export interface NieuwsAntwoord {
  officieel: NieuwsItem[];
  pers: NieuwsItem[];
  bronnen: BronStatus[];
  bijgewerkt: string; // ISO van deze ophaalronde
  laatstGeslaagd: string | null; // ISO; nu als minstens één bron slaagde
}

// Ruw item zoals uit een feed geparseerd, vóór filtering.
export interface RuwItem {
  titel: string;
  url: string;
  gepubliceerdOp: string | null; // ISO of null
}

export const MAX_PER_GROEP = 8;
export const DATUMPOORT_DAGEN = 7;

// ---- Trefwoorden (persfeeds zijn algemene faits-divers-feeds) ---------------
// Franse termen voor: brand, rook, evacuatie, luchtkwaliteit, brandgevaar,
// natuurramp. Bewust op de woordstam, accent-ongevoelig (zie normaliseer()).
// Toegepast op BEIDE groepen, zodat ook officiële feeds op het onderwerp blijven.
export const TREFWOORDEN: string[] = [
  "incendie", // brand
  "feu de foret", // (bos)brand
  "feux de foret",
  "feu de vegetation",
  "feux de vegetation",
  "brule", // verbrand/brûlé
  "sinistre", // getroffen gebied/ramp
  "fumee", // rook
  "evacuation", // evacuatie
  "evacue", // geëvacueerd
  "confinement", // schuilen/binnenblijven bij rook
  "qualite de l air", // luchtkwaliteit
  "pollution de l air",
  "particules", // fijnstof
  "atmo", // luchtkwaliteitsindex (Atmo)
  "risque incendie", // brandgevaar
  "risque feu", // brandgevaar
  "vigilance", // waakzaamheidsniveau
  "catastrophe naturelle", // natuurramp
  "pompiers", // brandweer
  "sdis", // brandweerdienst (Service départemental d'incendie et de secours)
];

// Diakritische tekens weg + kleine letters, zodat "forêt"/"foret" en
// "évacuation"/"evacuation" gelijk matchen.
export function normaliseer(tekst: string): string {
  return tekst
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function bevatTrefwoord(titel: string): boolean {
  const genormaliseerd = normaliseer(titel);
  return TREFWOORDEN.some((woord) => genormaliseerd.includes(woord));
}

// ---- Host-allowlist ---------------------------------------------------------
// Registreerbaar domein = de laatste twee labels (voldoende voor .fr/.com/.org
// die hier voorkomen; geen meervoudige eTLD's als .co.uk in het bronnenbestand).
export function registreerbaarDomein(host: string): string {
  const schoon = host.toLowerCase().replace(/^www\./, "");
  const delen = schoon.split(".");
  if (delen.length <= 2) return schoon;
  return delen.slice(-2).join(".");
}

export function hostVanUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname;
  } catch {
    return null;
  }
}

// De verzameling toegestane registreerbare domeinen, afgeleid uit het bestand.
export function bouwAllowlist(bronnen: Nieuwsbron[]): Set<string> {
  const set = new Set<string>();
  for (const bron of bronnen) {
    const host = hostVanUrl(bron.url);
    if (host) set.add(registreerbaarDomein(host));
  }
  return set;
}

export function hostToegestaan(url: string, allowlist: Set<string>): boolean {
  const host = hostVanUrl(url);
  if (!host) return false;
  return allowlist.has(registreerbaarDomein(host));
}

// ---- Datumpoort -------------------------------------------------------------
// Hard: item zonder bruikbare datum → geweigerd. Ouder dan DATUMPOORT_DAGEN →
// geweigerd. `nu` wordt meegegeven zodat de functie testbaar en tijdloos is.
export function binnenDatumpoort(iso: string | null, nu: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (t > nu + 24 * 60 * 60 * 1000) return false; // toekomst > 1 dag = onbruikbaar
  const grens = nu - DATUMPOORT_DAGEN * 24 * 60 * 60 * 1000;
  return t >= grens;
}

// ---- Feed-parsing (RSS <item> én Atom <entry>) ------------------------------
export function parseerFeed(xml: string): RuwItem[] {
  const items: RuwItem[] = [];
  const blokken = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ];

  for (const match of blokken) {
    const blok = match[0];
    const titel = schoonTekst(leesTag(blok, "title"));
    const url = leesLink(blok);
    const datum =
      leesTag(blok, "pubDate") ||
      leesTag(blok, "published") ||
      leesTag(blok, "updated") ||
      leesTag(blok, "dc:date");
    const iso = naarIso(schoonTekst(datum));

    if (!titel || !url) continue;
    items.push({ titel, url, gepubliceerdOp: iso });
  }

  return items;
}

// Bouwt uit één bron een genormaliseerde lijst NieuwsItems, met alle filters.
export function filterBron(
  ruw: RuwItem[],
  bron: Nieuwsbron,
  allowlist: Set<string>,
  nu: number
): NieuwsItem[] {
  const gezien = new Set<string>();
  const uit: NieuwsItem[] = [];

  for (const item of ruw) {
    if (!hostToegestaan(item.url, allowlist)) continue; // host niet in bestand
    if (!binnenDatumpoort(item.gepubliceerdOp, nu)) continue; // datumpoort
    if (!bevatTrefwoord(item.titel)) continue; // trefwoordfilter

    const sleutel = normaliseer(item.titel).replace(/\s+/g, " ").trim();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);

    uit.push({
      titel: item.titel,
      url: item.url,
      bron: bron.naam,
      soort: bron.soort,
      paywall: bron.paywall,
      gepubliceerdOp: item.gepubliceerdOp as string, // door datumpoort gegarandeerd
    });
  }

  return uit;
}

export function sorteerNieuwsteBoven(items: NieuwsItem[]): NieuwsItem[] {
  return [...items].sort(
    (a, b) => Date.parse(b.gepubliceerdOp) - Date.parse(a.gepubliceerdOp)
  );
}

// ---- XML-hulpjes (overgenomen uit de oude route) ----------------------------
function leesTag(blok: string, tag: string): string {
  const patroon = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  return blok.match(patroon)?.[1] ?? "";
}

// Link uit RSS (<link>https://…</link>) of Atom (<link href="https://…"/>).
function leesLink(blok: string): string | null {
  const atom = blok.match(
    /<link[^>]*\shref=["']([^"']+)["'][^>]*\/?>/i
  );
  if (atom) {
    const url = schoonTekst(atom[1]);
    return url && isVeiligeUrl(url) ? url : null;
  }
  const rss = schoonTekst(leesTag(blok, "link"));
  return rss && isVeiligeUrl(rss) ? rss : null;
}

function schoonTekst(waarde: string): string {
  return decodeerXml(
    waarde
      .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function naarIso(waarde: string): string | null {
  if (!waarde) return null;
  const d = new Date(waarde);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function decodeerXml(waarde: string): string {
  const benoemd: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
    nbsp: " ",
  };
  return waarde.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (volledig, code: string) => {
    if (code.startsWith("#x")) {
      const getal = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(getal) ? String.fromCodePoint(getal) : volledig;
    }
    if (code.startsWith("#")) {
      const getal = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(getal) ? String.fromCodePoint(getal) : volledig;
    }
    return benoemd[code.toLowerCase()] ?? volledig;
  });
}

function isVeiligeUrl(waarde: string): boolean {
  try {
    const url = new URL(waarde);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
