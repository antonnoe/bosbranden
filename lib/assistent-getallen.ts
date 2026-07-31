// Pure cijfer- en datumcontrole op de modeluitvoer (fix 4). Los testbaar met
// `node --experimental-strip-types`: dit bestand heeft BEWUST geen runtime-imports
// met het @/-alias (dat wordt door node niet opgelost), zodat de test het direct
// kan laden. assistent-filter.ts her-exporteert deze functie.

// Structurele getallen die altijd zijn toegestaan als LOS getal (zonder eenheid):
// het meetvenster (24 uur, 12 uur) en de noodnummers (112, 18, 114). Zo valt een
// correct antwoord dat "de afgelopen 24 uur" of "bel 18 of 112" noemt niet onnodig
// terug. Getallen mét een eenheid (bijv. "18 km", "12 MW") lopen NIET via deze
// lijst maar via de strengere eenheidscontrole hieronder.
const STRUCTUREEL = new Set([24, 12, 112, 18, 114]);

const MAAND_NUMMER: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  maart: 3, mrt: 3, maa: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  augustus: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

// Langste tokens eerst, zodat "juli" niet als "jul" wordt gelezen.
const MAAND_RE = Object.keys(MAAND_NUMMER)
  .sort((a, b) => b.length - a.length)
  .join("|");

const EENHEID_NORM: Record<string, string> = {
  mw: "mw",
  megawatt: "mw",
  km: "km",
  kilometer: "km",
};

// Alle getallen uit een tekst, genormaliseerd naar hun afgeronde gehele waarde,
// zodat een afgeronde "35" en een precieze "35,2"/"35.2" als hetzelfde tellen
// (het model rondt vaak af). Komma én punt gelden als decimaalteken.
function getallenVan(tekst: string): Set<number> {
  const set = new Set<number>();
  for (const ruw of tekst.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const n = Number(ruw.replace(",", "."));
    if (Number.isFinite(n)) set.add(Math.round(n));
  }
  return set;
}

// Dag-maandcombinaties uit een tekst, als "dag-maand"-sleutels. Twee schrijfwijzen:
//   A) dag + maandnaam of -afkorting  ("31 juli", "31 jul")
//   B) dag-maand numeriek             ("31-07", "31/07")
// De punt-vorm ("31.07") laten we bewust weg: die botst met decimalen als "35.2".
function datumParenVan(tekst: string): Set<string> {
  const laag = tekst.toLowerCase();
  const paren = new Set<string>();

  const reA = new RegExp(`\\b(\\d{1,2})\\s+(${MAAND_RE})\\b`, "g");
  for (const m of laag.matchAll(reA)) {
    const maand = MAAND_NUMMER[m[2]];
    if (maand) paren.add(`${Number(m[1])}-${maand}`);
  }

  const reB = /\b(\d{1,2})[-/](\d{1,2})\b/g;
  for (const m of laag.matchAll(reB)) {
    const dag = Number(m[1]);
    const maand = Number(m[2]);
    if (dag >= 1 && dag <= 31 && maand >= 1 && maand <= 12) paren.add(`${dag}-${maand}`);
  }
  return paren;
}

// Losse maanden (zonder dag), als maandnummers.
function maandNummersVan(tekst: string): Set<number> {
  const set = new Set<number>();
  const re = new RegExp(`\\b(${MAAND_RE})\\b`, "g");
  for (const m of tekst.toLowerCase().matchAll(re)) set.add(MAAND_NUMMER[m[1]]);
  return set;
}

// Getallen mét een eenheid, als "waarde|eenheid"-sleutels (afgeronde waarde), zodat
// een getal uit het ene veld niet als dekking dient voor een ander veld: 18 uit
// "18 km" dekt geen "18 MW".
function eenheidGetallenVan(tekst: string): Set<string> {
  const set = new Set<string>();
  const re = /(\d+(?:[.,]\d+)?)\s*(mw|megawatt|km|kilometer)\b/gi;
  for (const m of tekst.toLowerCase().matchAll(re)) {
    const n = Math.round(Number(m[1].replace(",", ".")));
    const eenheid = EENHEID_NORM[m[2]];
    if (Number.isFinite(n) && eenheid) set.add(`${n}|${eenheid}`);
  }
  return set;
}

// True zodra het antwoord iets bevat dat niet in de context staat. Vier assen:
//   1. dag-maandcombinatie die niet exact zo in de context staat (ook als dag en
//      maand er los wél in staan — dat is precies de "35 juli"-val);
//   2. een losse maand die niet in de context voorkomt;
//   3. een getal mét eenheid dat met díe eenheid niet in de context staat;
//   4. een los getal dat niet in de context staat en geen toegestaan structureel
//      getal is.
// Een true-uitkomst betekent: antwoord ONGELDIG.
export function bevatOnbekendeGetallen(antwoord: string, context: string): boolean {
  const ctxParen = datumParenVan(context);
  for (const p of datumParenVan(antwoord)) {
    if (!ctxParen.has(p)) return true;
  }

  const ctxMaanden = maandNummersVan(context);
  for (const maand of maandNummersVan(antwoord)) {
    if (!ctxMaanden.has(maand)) return true;
  }

  const ctxEenheid = eenheidGetallenVan(context);
  for (const g of eenheidGetallenVan(antwoord)) {
    if (!ctxEenheid.has(g)) return true;
  }

  const ctxGetallen = getallenVan(context);
  for (const n of getallenVan(antwoord)) {
    if (!ctxGetallen.has(n) && !STRUCTUREEL.has(n)) return true;
  }

  return false;
}
