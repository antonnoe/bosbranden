// Pure normalisatielogica voor de Vigilance-API. Bewust framework- én
// aliasvrij, zoals lib/rookbeoordeling.ts en lib/nieuws-thema.ts: alleen zo is
// de logica los te testen op kale node zonder Next-resolutie. De fetch en de
// portaal-administratie staan in lib/vigilance.ts. Zie scripts/test-vigilance.ts.
//
// De responsstructuur is op 03-09-2026 tegen de live API vastgesteld; ze staat
// beschreven in de README. Kort:
//
//   product.periods[]           echeance "J" (vandaag) en "J1" (morgen)
//     .timelaps.domain_ids[]      per departement: domain_id, max_color_id,
//                                 phenomenon_items[]
//     .per_phenomenon_items[]     dezelfde gegevens per fenomeen gegroepeerd
//
// Twee dingen uit het descriptif technique die deze doorloop raken:
//
//   "Tableau periods – en général deux blocs, un pour J et un autre pour J1.
//    Entre 0h et 6h locales un seul bloc (J)."
//
// Tussen middernacht en 06:00 Parijse tijd bestaat "morgen" dus niet. Dat is
// normaal en geen storing: er komt eenvoudig geen morgen-vak, en er wordt niets
// afgeleid om het gat te vullen.
//
//   "Tableau timelaps – pour le phénomène crues (phenomenon_id 4), les tableaux
//    sont vides pour J et J1."
//
// De kleur van crues komt daarom uit `phenomenon_max_color_id` en niet uit een
// timelaps-reeks. Wie de kleur uit timelaps zou halen, zou crues altijd als
// ontbrekend zien — dat wil zeggen: als niet beoordeeld, terwijl het wél
// beoordeeld is.
//
// De doorloop hieronder is desondanks vormvrij gebleven. Niet uit
// besluiteloosheid: dezelfde API leverde eerder onder een ander abonnement een
// 403, en de zusterapi bleek CSV te sturen waar JSON werd verwacht. Een parser
// die op één vorm staat, valt bij zo'n wijziging stil zonder dat iemand het
// merkt. Deze valt terug op minder gegevens, niet op verkeerde.

import { DEP_BY_CODE } from "./departements.ts";

// De negen fenomenen van de Vigilance, met hun ID's en Franse namen letterlijk
// uit de primaire bron: het "Descriptif technique des informations Vigilance
// METROPOLE – Flux public Vigilance" van Météo-France, sectie Carte, pagina 7,
// "Valeurs du champ phenomenon_id". Zie de README voor de vindplaats; het
// document draagt zelf geen versienummer of datum.
//
// `bevestigd` betekent hier precies één ding: dit ID staat in die tabel. Het is
// géén oordeel over of we het gevaar ooit in een respons hebben zien
// langskomen. Voegt Météo-France een tiende fenomeen toe, dan staat dat niet in
// de tabel, komt het op false te staan en is dat zichtbaar in
// /api/vigilance/debug in plaats van dat er een verzonnen naam bij komt.
//
// TWEE NAMEN WAREN FOUT vóór deze bron werd gelezen, en dat is precies waarom
// een implementatie van derden geen bron is:
//
//   ID 2 heette hier "pluie-inondation"; het document zegt "pluie".
//   ID 4 heette hier "inondation" (overstroming); het document zegt "crues".
//
// Dat tweede was inhoudelijk mis. `Crues` is hoogwater in rivieren, het domein
// van Vigicrues, en dat is iets anders dan overstroming in het algemeen. Het
// verschil met ID 9 (vagues submersion, water dat vanaf zee komt) was daarmee
// weg, en een lezer aan een rivier zou het verkeerde signaal hebben gekregen.
//
// De Nederlandse namen zijn vertalingen die niet méér beweren dan het Franse
// origineel. Waar het Frans kort is ("pluie"), is het Nederlands dat ook.
export const FENOMENEN: Record<number, { fr: string; nl: string; bevestigd: boolean }> = {
  1: { fr: "vent", nl: "wind", bevestigd: true },
  2: { fr: "pluie", nl: "regen", bevestigd: true },
  3: { fr: "orages", nl: "onweer", bevestigd: true },
  4: { fr: "crues", nl: "hoogwater in rivieren", bevestigd: true },
  5: { fr: "neige / verglas", nl: "sneeuw en ijzel", bevestigd: true },
  6: { fr: "canicule", nl: "hitte", bevestigd: true },
  7: { fr: "grand froid", nl: "strenge kou", bevestigd: true },
  8: { fr: "avalanches", nl: "lawines", bevestigd: true },
  9: { fr: "vagues submersion", nl: "hoge golven en overstroming vanaf zee", bevestigd: true },
};

// Canicule (6) en grand froid (7) zitten alleen seizoensgebonden in het
// carte-product. Officiële documentatiepagina van de API (Confluence
// OpenDataMeteoFrance, "API Bulletin Vigilance (EN)", bijgewerkt 02-09-2025,
// sectie "Common mistakes"), letterlijk:
//
//   "'heatwave' and 'extreme cold' phenomena absent from the mainland France
//    'carte' product: these two phenomena are only measured seasonally
//    (see products documentation)."
//
// Hun afwezigheid is dus geen storing, en al helemaal geen "geen hittegevaar".
// Het blijft wat elk ontbrekend fenomeen is: niet beoordeeld.
export const SEIZOENSGEBONDEN_FENOMENEN = [6, 7] as const;

// De vier Vigilance-kleuren, uit dezelfde bron, sectie Carte: "Valeurs des
// champs color_id": 1 vert, 2 jaune, 3 orange, 4 rouge.
//
// LET OP, TWEE VALKUILEN.
//
// 1. Dit is een andere schaal dan de brandrisicoschaal in lib/niveaus.ts. Daar
//    betekent 1 "laag risico"; hier betekent 1 "geen bijzonderheid". Ze mogen
//    nooit door elkaar worden gebruikt of in dezelfde legenda staan.
//
// 2. Binnen Vigilance zélf gebruikt het tekstproduct (/textesvigilance) een
//    ándere schaal dan het kaartproduct: daar loopt `risk_level` van "0" (vert)
//    tot "3" (rouge), en staat `risk_code` op "1" t/m "4". Wie ooit de teksten
//    gaat lezen en die 0-3 als deze 1-4 behandelt, verschuift elke kleur één
//    stap omlaag en maakt van rood oranje. Deze tabel geldt alleen voor de
//    kaart.
//
// `officieleKleur` is de RVB-waarde uit het document. `kleur` is de tint die de
// interface gebruikt: verdiept voor leesbaarheid tegen een lichte ondergrond,
// dezelfde afweging als in lib/niveaus.ts. Het officiële geel (#f9ff00) haalt
// geen bruikbaar contrast met zwarte noch witte tekst, en het officiële groen
// (#15ed13) is feller dan de rest van de kaart verdraagt. De officiële waarde
// staat ernaast zodat de afwijking zichtbaar is en niet stilzwijgend.
export const VIGILANCE_KLEUREN: Record<
  number,
  { fr: string; nl: string; kleur: string; officieleKleur: string }
> = {
  1: { fr: "vert", nl: "geen bijzonderheid", kleur: "#2f6b3a", officieleKleur: "#15ed13" },
  2: { fr: "jaune", nl: "wees oplettend", kleur: "#d4a017", officieleKleur: "#f9ff00" },
  3: { fr: "orange", nl: "wees zeer waakzaam", kleur: "#c2560f", officieleKleur: "#f7a401" },
  4: { fr: "rouge", nl: "absolute waakzaamheid", kleur: "#a4161a", officieleKleur: "#e71919" },
};

export type Termijn = "vandaag" | "morgen";

export interface VigilanceDepartement {
  // Hoogste kleur over alle fenomenen heen, zoals de API die zelf meegeeft.
  // Null wanneer de API geen totaal noemt: dan wordt hier NIETS berekend.
  max: number | null;
  // Uitsluitend de fenomenen die de API werkelijk noemt, op ID. Een ontbrekend
  // fenomeen betekent "niet beoordeeld" en NOOIT kleur 1. Op 03-09-2026 stuurde
  // de API alleen de ID's 1 t/m 6 mee; wie de afwezigheid van 8 als "geen
  // lawinegevaar" leest, verzint een geruststelling die Météo-France niet
  // heeft afgegeven.
  fenomenen: Record<number, number>;
}

export interface VigilanceData {
  departementen: Record<string, Record<Termijn, VigilanceDepartement>>;
  bijgewerkt: string | null;
}

type Json = unknown;

const DEP_KEYS = [
  "domain_id", "domain", "dep", "departement", "department", "code_dep",
  "code_departement", "numero_dep", "insee_dep", "code", "code_insee",
];
const MAX_KLEUR_KEYS = ["max_color_id", "max_colour_id", "color_max", "niveau_max"];
const FENOMEEN_ID_KEYS = ["phenomenon_id", "phenomenon", "phenomene_id", "phenomene", "id_phenomene"];
const FENOMEEN_KLEUR_KEYS = [
  "phenomenon_max_color_id", "phenomenon_color_id", "color_id", "colour_id", "niveau", "level",
];
const ECHEANCE_KEYS = ["echeance", "écheance", "ech", "period", "periode", "validity", "term"];
const DATE_KEYS = [
  "update_time", "updated_at", "date_production", "dateproduction",
  "production_date", "reference_time", "basetime", "date_publication",
  "publication_date", "date_diffusion", "diffusion_date", "created_at",
  "maj", "date_maj", "datemaj", "mise_a_jour", "derniere_maj",
];

// De Vigilance kent de termijnen "J" (vandaag) en "J1" (morgen). Dat is een
// andere telling dan de Météo des forêts, die J1 en J2 gebruikt: daar is J1
// vandaag. Wie die twee door elkaar haalt, schuift de hele kaart een dag op.
const TERMIJN_VANDAAG = ["j", "j0", "j+0", "aujourdhui", "aujourd'hui", "today"];
const TERMIJN_MORGEN = ["j1", "j+1", "demain", "tomorrow"];

// Drie toestanden, en de derde is het hele punt. "onbekend" betekent: hier
// stáát een termijn, maar niet een die wij kennen. Zo'n tak wordt overgeslagen
// in plaats van op de termijn van de ouder of op "vandaag" te vallen. Zou
// Météo-France ooit een J2 toevoegen, dan verschijnt overmorgen anders als de
// situatie van nu — precies de fout die deze module niet mag maken.
type Context = Termijn | "onbekend" | null;

function alsDepCode(v: Json): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  let s = String(v).trim().toUpperCase();
  if (/^\d{1}$/.test(s)) s = "0" + s;
  if (/^(FR)?(\d{2}|2A|2B)$/.test(s)) s = s.replace(/^FR/, "");
  if (s.length === 5 && /^\d{5}$/.test(s)) s = s.slice(0, 2);
  return DEP_BY_CODE[s] ? s : null;
}

function alsKleur(v: Json): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

function alsFenomeenId(v: Json): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  // Bewust niet begrensd op de negen bekende ID's: voegt Météo-France er een
  // toe, dan hoort die zichtbaar te worden in /api/vigilance/debug in plaats
  // van hier weggefilterd te raken.
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

function pakVeld(obj: Record<string, Json>, namen: string[]): Json {
  for (const [k, v] of Object.entries(obj)) {
    if (namen.includes(k.toLowerCase())) return v;
  }
  return undefined;
}

export function termijnVan(s: string): Termijn | null {
  const t = s.toLowerCase().replace(/[\s_-]/g, "");
  if (TERMIJN_MORGEN.includes(t)) return "morgen";
  if (TERMIJN_VANDAAG.includes(t)) return "vandaag";
  return null;
}

// Leest een echeance-veld uit dit object. Geeft null als er geen staat, en
// "onbekend" als er wél een staat maar de waarde niet herkend wordt.
function echeanceIn(obj: Record<string, Json>): Context {
  for (const [k, v] of Object.entries(obj)) {
    if (!ECHEANCE_KEYS.includes(k.toLowerCase())) continue;
    if (typeof v !== "string" && typeof v !== "number") continue;
    return termijnVan(String(v)) ?? "onbekend";
  }
  return null;
}

function leegDepartement(): Record<Termijn, VigilanceDepartement> {
  return {
    vandaag: { max: null, fenomenen: {} },
    morgen: { max: null, fenomenen: {} },
  };
}

export function normaliseerVigilance(raw: Json): VigilanceData {
  const departementen: VigilanceData["departementen"] = {};
  let bijgewerkt: string | null = null;

  const vak = (dep: string, termijn: Termijn) => {
    if (!departementen[dep]) departementen[dep] = leegDepartement();
    return departementen[dep][termijn];
  };

  const loop = (node: Json, context: Context) => {
    if (context === "onbekend") return;

    if (Array.isArray(node)) {
      for (const item of node) loop(item, context);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, Json>;

    // context is hierboven al op "onbekend" afgevangen, dus wat hier overblijft
    // is een echte termijn of niets.
    const eigen = echeanceIn(obj);
    if (eigen === "onbekend") return;
    const hier: Termijn | null = eigen ?? context;

    if (!bijgewerkt) {
      const d = pakVeld(obj, DATE_KEYS);
      if (typeof d === "string" && d.length >= 8) bijgewerkt = d;
    }

    // Een departement in dit object? Dan geldt alles eronder voor dat
    // departement, inclusief de fenomeenlijst die eraan hangt.
    const dep = alsDepCode(pakVeld(obj, DEP_KEYS));
    if (dep) {
      // Zonder termijn valt er niets te plaatsen. Eerder viel dit terug op
      // "vandaag"; dat leverde een waarde op die er in de bron niet stond.
      if (hier === null) return;

      const max = alsKleur(pakVeld(obj, MAX_KLEUR_KEYS));
      if (max != null && vak(dep, hier).max == null) vak(dep, hier).max = max;

      verzamelFenomenen(obj, dep, hier);
      for (const v of Object.values(obj)) loopFenomeen(v, dep, hier);
      return;
    }

    for (const [k, v] of Object.entries(obj)) {
      const kDep = alsDepCode(k);
      if (kDep) {
        if (hier === null) continue;
        const n = alsKleur(v);
        if (n != null) {
          if (vak(kDep, hier).max == null) vak(kDep, hier).max = n;
        } else {
          loopFenomeen(v, kDep, hier);
        }
        continue;
      }
      // Een sleutel die zelf een termijn benoemt ({"J1": {...}}) verfijnt de
      // context; een gewone sleutel laat hem staan.
      const uitSleutel = termijnVan(k);
      loop(v, uitSleutel ?? hier);
    }
  };

  // Binnen een departementstak: fenomeen-kleurparen oogsten.
  const loopFenomeen = (node: Json, dep: string, termijn: Termijn) => {
    if (Array.isArray(node)) {
      for (const item of node) loopFenomeen(item, dep, termijn);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, Json>;

    const eigen = echeanceIn(obj);
    if (eigen === "onbekend") return;
    const hier = eigen ?? termijn;

    const max = alsKleur(pakVeld(obj, MAX_KLEUR_KEYS));
    if (max != null && vak(dep, hier).max == null) vak(dep, hier).max = max;

    verzamelFenomenen(obj, dep, hier);
    for (const [k, v] of Object.entries(obj)) {
      loopFenomeen(v, dep, termijnVan(k) ?? hier);
    }
  };

  const verzamelFenomenen = (obj: Record<string, Json>, dep: string, termijn: Termijn) => {
    const id = alsFenomeenId(pakVeld(obj, FENOMEEN_ID_KEYS));
    if (id == null) return;
    const kleur = alsKleur(pakVeld(obj, FENOMEEN_KLEUR_KEYS));
    if (kleur == null) return;
    const doel = vak(dep, termijn).fenomenen;
    // Eerste waarde wint: bij een lijst van uurvakken is de samenvatting die de
    // API bovenaan zet leidend, niet het laatste uur dat we tegenkomen.
    if (doel[id] == null) doel[id] = kleur;
  };

  loop(raw, null);
  return { departementen, bijgewerkt };
}

// Aantal departementen waarvoor werkelijk iets is gevonden. De route gebruikt
// dit om te bepalen of er iets te tonen valt; nul betekent een lege kaart, geen
// groene kaart.
export function telDepartementen(data: VigilanceData): number {
  return Object.values(data.departementen).filter((d) =>
    (["vandaag", "morgen"] as const).some(
      (t) => d[t].max != null || Object.keys(d[t].fenomenen).length > 0
    )
  ).length;
}

// Welke fenomeen-ID's kwamen er werkelijk in deze respons voor, en met welke
// hoogste kleur? Dit is het gereedschap om de ID-tabel hierboven te toetsen:
// verschijnt er bij een winterse storm een ID 5 in de Alpen, dan is "sneeuw en
// ijzel" bevestigd. De debugroute toont deze lijst.
export function waargenomenFenomenen(
  data: VigilanceData
): Array<{ id: number; naam: string | null; bevestigd: boolean; hoogsteKleur: number; aantalDepartementen: number }> {
  const teller = new Map<number, { hoogste: number; deps: Set<string> }>();
  for (const [dep, termijnen] of Object.entries(data.departementen)) {
    for (const t of ["vandaag", "morgen"] as const) {
      for (const [idTekst, kleur] of Object.entries(termijnen[t].fenomenen)) {
        const id = Number(idTekst);
        const bestaand = teller.get(id) ?? { hoogste: 0, deps: new Set<string>() };
        bestaand.hoogste = Math.max(bestaand.hoogste, kleur);
        bestaand.deps.add(dep);
        teller.set(id, bestaand);
      }
    }
  }
  return [...teller.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, v]) => ({
      id,
      naam: FENOMENEN[id]?.nl ?? null,
      bevestigd: FENOMENEN[id]?.bevestigd ?? false,
      hoogsteKleur: v.hoogste,
      aantalDepartementen: v.deps.size,
    }));
}

// Compacte schets van een onbekende JSON-structuur, voor de debugroute.
export function structuurSchets(node: Json, diepte = 0): Json {
  if (diepte > 4) return "…";
  if (Array.isArray(node)) {
    return node.length === 0 ? [] : [`array(${node.length})`, structuurSchets(node[0], diepte + 1)];
  }
  if (node === null || typeof node !== "object") return typeof node;
  const obj = node as Record<string, Json>;
  const uit: Record<string, Json> = {};
  for (const [k, v] of Object.entries(obj).slice(0, 12)) {
    uit[k] = structuurSchets(v, diepte + 1);
  }
  return uit;
}
