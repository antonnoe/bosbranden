// Nederlandse samenvatting van een Frans nieuwsartikel (H). We roepen Antons
// bestaande dienst SERVER-SIDE aan (H1 — geen CORS in de browser) en bewaren het
// resultaat per artikel-URL in een module-cache (H4): dezelfde URL wordt binnen
// een serverinstantie nooit twee keer opgehaald, zodat de kosten met het aantal
// artikelen schalen, niet met het aantal bezoekers. De dienst zelf cachet ook
// per URL, dus zelfs na een koude start blijven herhaalde aanvragen goedkoop.

import type { EcosystemLink } from "@/lib/nieuws-filter";

const DIENST_URL = "https://if-tools-api.vercel.app/api/generate-summary";
const CONTEXT_URL = "https://www.nederlanders.fr/page/bosbranden";
const CONTEXT_TITLE = "Weer en waarschuwingen Frankrijk";
const TIMEOUT_MS = 9000;

export interface Samenvatting {
  titelNl: string | null;
  samenvatting: string | null; // markdown
  ecosystemLinks: EcosystemLink[];
  ok: boolean;
}

// Alleen geslaagde resultaten worden permanent bewaard; een mislukte poging mag
// later opnieuw (bij een volgende revalidatie), zodat een tijdelijke storing niet
// blijft plakken — maar binnen één geslaagde ronde nooit dubbel opgevraagd.
const CACHE = new Map<string, Samenvatting>();

const MISLUKT: Samenvatting = {
  titelNl: null,
  samenvatting: null,
  ecosystemLinks: [],
  ok: false,
};

export async function haalSamenvatting(url: string, franseTitel: string): Promise<Samenvatting> {
  const bestaand = CACHE.get(url);
  if (bestaand) return bestaand;

  const resultaat = await genereer(url, franseTitel);
  if (resultaat.ok) CACHE.set(url, resultaat);
  return resultaat;
}

async function genereer(frenchUrl: string, franseTitel: string): Promise<Samenvatting> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(DIENST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        french_url: frenchUrl,
        context_url: CONTEXT_URL,
        context_title: CONTEXT_TITLE,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return MISLUKT;
    const json: unknown = await res.json();
    const samenvatting = leesSamenvatting(json);
    if (!samenvatting) return MISLUKT;
    return {
      titelNl: leidTitelAf(samenvatting) ?? franseTitel,
      samenvatting,
      ecosystemLinks: normaliseerEcosystem((json as Record<string, unknown>).ecosystem),
      ok: true,
    };
  } catch {
    return MISLUKT;
  } finally {
    clearTimeout(timer);
  }
}

function leesSamenvatting(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const summary = (json as Record<string, unknown>).summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

// Nederlandse kop uit de samenvatting (H2): de eerste markdown-kop of anders de
// eerste zin, ingekort. Markdown-opmaak (# ** [] ()) wordt uit de kop gehaald.
function leidTitelAf(markdown: string): string | null {
  const regels = markdown.split(/\r?\n/).map((r) => r.trim());
  const kopRegel = regels.find((r) => /^#{1,6}\s+/.test(r));
  const ruw = kopRegel
    ? kopRegel.replace(/^#{1,6}\s+/, "")
    : (regels.find((r) => r.length > 0) ?? "");
  const schoon = ontdoeVanOpmaak(ruw);
  if (!schoon) return null;
  // Eerste zin; bij een lange kop netjes inkorten.
  const eersteZin = schoon.split(/(?<=[.!?])\s/)[0] ?? schoon;
  const kort = eersteZin.length > 100 ? `${eersteZin.slice(0, 97).trimEnd()}…` : eersteZin;
  return kort;
}

function ontdoeVanOpmaak(tekst: string): string {
  return tekst
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [tekst](url) → tekst
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// De dienst kan ecosystem-links in verschillende vormen teruggeven; we
// normaliseren defensief naar een lijst {label, url}. Onbruikbare vormen (bv. een
// losse string zonder URL) leveren gewoon een lege lijst op.
function normaliseerEcosystem(ecosystem: unknown): EcosystemLink[] {
  const uit: EcosystemLink[] = [];
  const voegToe = (label: unknown, url: unknown) => {
    if (typeof url !== "string" || !veiligeUrl(url)) return;
    const tekst = typeof label === "string" && label.trim() ? label.trim() : url;
    uit.push({ label: tekst, url });
  };

  if (Array.isArray(ecosystem)) {
    for (const item of ecosystem) {
      if (typeof item === "string") voegToe(item, item);
      else if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        voegToe(rec.title ?? rec.label ?? rec.name, rec.url ?? rec.href ?? rec.link);
      }
    }
  } else if (ecosystem && typeof ecosystem === "object") {
    for (const [sleutel, waarde] of Object.entries(ecosystem as Record<string, unknown>)) {
      if (typeof waarde === "string") voegToe(sleutel, waarde);
      else if (waarde && typeof waarde === "object") {
        const rec = waarde as Record<string, unknown>;
        voegToe(rec.title ?? rec.label ?? sleutel, rec.url ?? rec.href ?? rec.link);
      }
    }
  }
  return uit.slice(0, 8);
}

function veiligeUrl(waarde: string): boolean {
  try {
    const u = new URL(waarde);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
