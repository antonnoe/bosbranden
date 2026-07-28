// Nederlandse samenvatting van een Frans nieuwsartikel (H). De dienst wordt
// SERVER-SIDE aangeroepen (H1 — geen CORS). De cache is de Next Data Cache via
// unstable_cache (B1): die overleeft koude starts, want hij wordt buiten de
// functie-instantie bewaard (op Vercel de durable Data Cache). Gekozen boven
// Vercel KV/Blob omdat er geen extra infrastructuur, koppeling of secrets voor
// nodig zijn en de sleutel — de artikel-URL — er natuurlijk in past; een
// samenvatting per URL is stabiel, dus een lange bewaartermijn kan.
//
// Per regeneratie worden hooguit MAX_NIEUW_PER_RONDE nog niet-gecachete
// samenvattingen opgevraagd (B2): de budget-poort staat in het cache-miss-pad,
// dus een hit is gratis en telt niet mee. De rest blijft die ronde Frans en komt
// de volgende ronde binnen. Ophalen gebeurt parallel (B3).

import { unstable_cache } from "next/cache";
import type { EcosystemLink } from "@/lib/nieuws-filter";
import { haalAlle, metGate, type Budget } from "@/lib/nieuws-budget";
import { bouwContextTitel, corrigeerVaktermen } from "@/lib/nieuws-vaktermen";

const DIENST_URL =
  process.env.NIEUWS_SAMENVAT_URL ?? "https://if-tools-api.vercel.app/api/generate-summary";
const CONTEXT_URL = "https://www.nederlanders.fr/page/bosbranden";
const CONTEXT_TITLE = "Weer en waarschuwingen Frankrijk";
// De dienst doet er gemeten ~9,2 s over; 9 s brak vrijwel elke aanroep af. De
// vier aanroepen lopen parallel (Promise.all), dus de wachttijd is die van de
// traagste, niet de som. Zie ook maxDuration in app/api/nieuws/route.ts.
const TIMEOUT_MS = 30000;

// Bewaartermijn van een geslaagde samenvatting in de Data Cache: lang, want per
// URL stabiel. 30 dagen.
const SAMENVATTING_REVALIDATE = 60 * 60 * 24 * 30;

// Hooguit vier nieuwe (dienst-)aanvragen per regeneratie, zodat de route niet
// tegen de functietijdslimiet loopt (B2).
export const MAX_NIEUW_PER_RONDE = 4;

export interface Samenvatting {
  titelNl: string | null;
  samenvatting: string | null; // markdown
  ecosystemLinks: EcosystemLink[];
}

export interface ArtikelSleutel {
  url: string;
  titel: string; // Franse kop, gebruikt als terugval-titel
}

// Durable read-through per URL. De wrapped functie draait ALLEEN bij een
// cache-miss; dan telt de budget-poort en wordt de dienst gebeld. Op een hit komt
// de bewaarde samenvatting terug zonder de dienst te bellen en zonder budget te
// gebruiken. Een fout (dienst mislukt of budget op) gooit, zodat er niets wordt
// gecachet en de volgende ronde het opnieuw probeert.
function durableSamenvatting(sleutel: string, budget: Budget): Promise<Samenvatting> {
  // De titel zit in de closure; hij hoort niet in de cachesleutel (de URL is de
  // sleutel). unstable_cache identificeert de entry op keyParts + de URL.
  const titel = titelPerUrl.get(sleutel) ?? "";
  return unstable_cache(
    () => metGate(budget, () => genereer(sleutel, titel)),
    ["nieuws-samenvatting-v1", sleutel],
    { revalidate: SAMENVATTING_REVALIDATE }
  )();
}

// Kleine hulpkaart zodat de Franse terugval-titel beschikbaar is binnen de
// durable functie zonder in de cachesleutel te belanden.
const titelPerUrl = new Map<string, string>();

export async function haalSamenvattingen(
  items: ArtikelSleutel[],
  maxNieuw: number = MAX_NIEUW_PER_RONDE
): Promise<Map<string, Samenvatting | null>> {
  for (const item of items) titelPerUrl.set(item.url, item.titel);
  const urls = items.map((i) => i.url);
  return haalAlle<Samenvatting>(urls, maxNieuw, durableSamenvatting);
}

// Roept de dienst aan en normaliseert het antwoord. GOOIT bij elke fout, zodat
// er niets mislukts in de durable cache belandt.
async function genereer(frenchUrl: string, franseTitel: string): Promise<Samenvatting> {
  const controller = new AbortController();
  const start = Date.now();
  let afgebroken = false;
  const timer = setTimeout(() => {
    afgebroken = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    // GEEN `cache: "no-store"`: deze fetch draait binnen unstable_cache, en die
    // combinatie gooit in Next.js een fout (waardoor élke samenvatting stil
    // mislukte). unstable_cache regelt het bewaren al.
    const res = await fetch(DIENST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        french_url: frenchUrl,
        context_url: CONTEXT_URL,
        // C1: woordenlijst meegeven via het gedocumenteerde context_title-veld.
        context_title: bouwContextTitel(CONTEXT_TITLE),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`dienst antwoordde met status ${res.status}`);
    const json: unknown = await res.json();
    const ruw = leesSamenvatting(json);
    if (!ruw) throw new Error("geen bruikbare samenvatting in het antwoord");
    // C1-vangnet: bekende vaktermfouten alsnog rechtzetten (idempotent).
    const samenvatting = corrigeerVaktermen(ruw);
    return {
      titelNl: corrigeerVaktermen(leidTitelAf(samenvatting) ?? franseTitel),
      samenvatting,
      ecosystemLinks: normaliseerEcosystem((json as Record<string, unknown>).ecosystem),
    };
  } catch (fout) {
    // NIET stil laten weglopen: log waaróm een samenvatting mislukt, zodat een
    // volgende storing zichtbaar is in plaats van een stille terugval op Frans.
    // (Dit is een echte dienst-/netwerkfout; het budget-overslaan zit in metGate
    //  en komt hier niet langs, dus deze log blijft betekenisvol.)
    const verstreken = Date.now() - start;
    const isTimeout = afgebroken || (fout instanceof Error && fout.name === "AbortError");
    if (isTimeout) {
      console.error(
        `[nieuws-samenvatting] TIMEOUT na ${verstreken} ms (limiet ${TIMEOUT_MS} ms) voor ${frenchUrl}`
      );
    } else {
      const reden = fout instanceof Error ? fout.message : String(fout);
      console.error(
        `[nieuws-samenvatting] mislukt na ${verstreken} ms voor ${frenchUrl}: ${reden}`
      );
    }
    throw fout;
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
  const eersteZin = schoon.split(/(?<=[.!?])\s/)[0] ?? schoon;
  return eersteZin.length > 100 ? `${eersteZin.slice(0, 97).trimEnd()}…` : eersteZin;
}

function ontdoeVanOpmaak(tekst: string): string {
  return tekst
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
