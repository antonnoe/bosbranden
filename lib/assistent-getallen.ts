// Pure cijfer- en datumcontrole op de modeluitvoer (fix 4). Los testbaar met
// `node --experimental-strip-types`: dit bestand heeft BEWUST geen runtime-imports
// met het @/-alias (dat wordt door node niet opgelost), zodat de test het direct
// kan laden. assistent-filter.ts her-exporteert deze functie.

const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

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

function maandenVan(tekst: string): Set<string> {
  const laag = tekst.toLowerCase();
  return new Set(MAANDEN.filter((maand) => laag.includes(maand)));
}

// True zodra het antwoord een getal of een maand-/datumaanduiding bevat die niet
// in de context voorkomt. Dat is precies het patroon van de bug ("35 april": de
// maand april staat niet in de context; het getal 35 is uit de FRP-waarde
// hergebruikt als dagnummer). Een true-uitkomst betekent: antwoord ONGELDIG.
export function bevatOnbekendeGetallen(antwoord: string, context: string): boolean {
  const ctxGetallen = getallenVan(context);
  for (const n of getallenVan(antwoord)) {
    if (!ctxGetallen.has(n)) return true;
  }
  const ctxMaanden = maandenVan(context);
  for (const maand of maandenVan(antwoord)) {
    if (!ctxMaanden.has(maand)) return true;
  }
  return false;
}
