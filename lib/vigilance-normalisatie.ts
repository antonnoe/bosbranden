// Pure normalisatielogica voor de Vigilance-API. Bewust framework- én
// aliasvrij, zoals lib/rookbeoordeling.ts en lib/nieuws-thema.ts: alleen zo is
// de logica los te testen op kale node zonder Next-resolutie. De fetch en de
// portaal-administratie staan in lib/vigilance.ts. Zie scripts/test-vigilance.ts.
//
// De responsstructuur is op 03-09-2026 tegen de live API vastgesteld; ze staat
// beschreven in de README. Kort:
//
//   product.periods[]           twee stuks, echeance "J" (vandaag) en "J1"
//     .timelaps.domain_ids[]      per departement: domain_id, max_color_id,
//                                 phenomenon_items[]
//     .per_phenomenon_items[]     dezelfde gegevens per fenomeen gegroepeerd
//
// De doorloop hieronder is desondanks vormvrij gebleven. Niet uit
// besluiteloosheid: dezelfde API leverde eerder onder een ander abonnement een
// 403, en de zusterapi bleek CSV te sturen waar JSON werd verwacht. Een parser
// die op één vorm staat, valt bij zo'n wijziging stil zonder dat iemand het
// merkt. Deze valt terug op minder gegevens, niet op verkeerde.

import { DEP_BY_CODE } from "./departements.ts";

// De negen fenomenen van de Vigilance, met hun ID zoals de API die gebruikt.
//
// BEWIJSSTATUS. Op 03-09-2026 kwamen alleen de ID's 1 t/m 6 in de respons voor;
// 7, 8 en 9 (strenge kou, lawines, hoge golven) zijn winter- en kustgevaren die
// er in september simpelweg niet zijn. Van die zes is er één hard bevestigd:
// ID 6 stond op geel in 07, 11, 26, 30, 34, 66 en 84, precies de mediterrane
// departementen begin september, wat alleen hitte kan zijn. De overige acht
// ID's komen uit werkende implementaties van derden en zijn nog niet tegen een
// waarneming getoetst.
//
// Daarom is `bevestigd` een veld en geen voetnoot: zolang het false is, is de
// Nederlandse naam een aanname over een veiligheidssignaal. Wie een van deze
// gevaren in de interface gaat tonen, hoort eerst één waarneming af te wachten
// waarin het ID en het weerbeeld elkaar bevestigen, zoals hierboven bij hitte.
// /api/vigilance/debug lijst de waargenomen ID's op om dat mogelijk te maken.
export const FENOMENEN: Record<number, { fr: string; nl: string; bevestigd: boolean }> = {
  1: { fr: "vent violent", nl: "zware wind", bevestigd: false },
  2: { fr: "pluie-inondation", nl: "regen en wateroverlast", bevestigd: false },
  3: { fr: "orages", nl: "onweer", bevestigd: false },
  4: { fr: "inondation", nl: "overstroming", bevestigd: false },
  5: { fr: "neige-verglas", nl: "sneeuw en ijzel", bevestigd: false },
  6: { fr: "canicule", nl: "hitte", bevestigd: true },
  7: { fr: "grand froid", nl: "strenge kou", bevestigd: false },
  8: { fr: "avalanches", nl: "lawines", bevestigd: false },
  9: { fr: "vagues-submersion", nl: "hoge golven en overstroming vanaf zee", bevestigd: false },
};

// De vier Vigilance-kleuren. LET OP: dit is een andere schaal dan de
// brandrisicoschaal in lib/niveaus.ts. Daar betekent 1 "laag risico"; hier
// betekent 1 "geen bijzonderheid". Ze mogen daarom nooit door elkaar worden
// gebruikt of in dezelfde legenda staan.
export const VIGILANCE_KLEUREN: Record<number, { fr: string; nl: string; kleur: string }> = {
  1: { fr: "vert", nl: "geen bijzonderheid", kleur: "#2f6b3a" },
  2: { fr: "jaune", nl: "wees oplettend", kleur: "#d4a017" },
  3: { fr: "orange", nl: "wees zeer waakzaam", kleur: "#c2560f" },
  4: { fr: "rouge", nl: "absolute waakzaamheid", kleur: "#a4161a" },
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
