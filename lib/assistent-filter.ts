// Pure, los te testen bewakingslogica voor de assistent:
//   - normaliseer / bevatNoodsignaal: noodsignaal-detectie (requirement 3),
//   - filterUrls: URL-allowlist op de UITVOER (requirement 4).
// Geen Next-, netwerk- of model-import, zodat dit met node te testen is.

import { NOODSIGNAALWOORDEN } from "@/data/noodsignalen";

// Diakritische tekens weg + kleine letters + leestekens tot spaties, zodat
// "flammes"/"flamme" en "évacuer"/"evacuer" gelijk matchen.
export function normaliseer(tekst: string): string {
  return tekst
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const GENORMALISEERDE_SIGNALEN = NOODSIGNAALWOORDEN.map(normaliseer);

// Detecteert een acuut noodsignaal in de vraag. Draait VÓÓR elke modelaanroep.
// Substring-match op de genormaliseerde tekst — de signalen zijn bewust
// meerwoords-frasen ("het brandt", "rook in huis") zodat gewone vragen over
// brandgevaar niet per ongeluk het noodantwoord triggeren.
export function bevatNoodsignaal(vraag: string): boolean {
  const g = normaliseer(vraag);
  if (!g) return false;
  return GENORMALISEERDE_SIGNALEN.some((woord) => woord.length > 0 && g.includes(woord));
}

// ---- URL-allowlist op de uitvoer -------------------------------------------
// Alleen eigen routes (relatieve paden), nederlanders.fr, infofrankrijk.com en
// officiële bronnen (*.gouv.fr, meteofrance.com) blijven staan; al het andere
// wordt gestript vóór verzending.
function hostToegestaan(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!h) return false;
  const toegestaan = ["nederlanders.fr", "infofrankrijk.com", "meteofrance.com"];
  if (toegestaan.includes(h)) return true;
  if (toegestaan.some((d) => h.endsWith(`.${d}`))) return true;
  if (h === "gouv.fr" || h.endsWith(".gouv.fr")) return true;
  return false;
}

function urlToegestaan(url: string): boolean {
  const schoon = url.trim();
  // Relatief pad naar een eigen route.
  if (schoon.startsWith("/")) return true;
  try {
    const u = new URL(schoon.startsWith("http") ? schoon : `https://${schoon}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return hostToegestaan(u.hostname);
  } catch {
    return false;
  }
}

// Verwijdert niet-toegestane links uit de modeluitvoer. Markdown-links behouden
// hun zichtbare tekst; losse URL's worden weggehaald. Toegestane links blijven.
export function filterUrls(tekst: string): string {
  let uit = tekst;

  // 1. Markdown-links [tekst](url) → tekst als de url niet mag; anders ongemoeid.
  uit = uit.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (heel, label: string, url: string) =>
    urlToegestaan(url) ? heel : label
  );

  // 2. Losse URL's (http(s):// of www.…) die niet mogen → weghalen.
  uit = uit.replace(/\bhttps?:\/\/[^\s<>()\]]+/gi, (m) => (urlToegestaan(m) ? m : ""));
  uit = uit.replace(/\bwww\.[^\s<>()\]]+/gi, (m) => (urlToegestaan(m) ? m : ""));

  // Nette spaties: dubbele spaties en spatie vóór leesteken opruimen.
  return uit.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").trim();
}
