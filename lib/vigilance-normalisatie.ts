// Pure normalisatielogica voor de Vigilance-API. Bewust framework- én
// aliasvrij, zoals lib/rookbeoordeling.ts en lib/nieuws-thema.ts: alleen zo is
// de logica los te testen op kale node zonder Next-resolutie. De fetch en de
// portaal-administratie staan in lib/vigilance.ts, dat hier alles uit
// doorgeeft. Zie scripts/test-vigilance.ts.

import { DEP_BY_CODE } from "./departements.ts";

// De negen fenomenen van de Vigilance, met hun ID zoals de API die gebruikt.
// De ID's zijn overgenomen uit werkende implementaties van derden en zijn nog
// niet tegen de officiële documentatie geverifieerd (het API-portaal is
// ingelogd-only). /api/vigilance/debug toont de ID's die de API werkelijk
// terugstuurt; een onbekend ID wordt hieronder nooit stilzwijgend hernoemd.
export const FENOMENEN: Record<number, { fr: string; nl: string }> = {
  1: { fr: "vent violent", nl: "zware wind" },
  2: { fr: "pluie-inondation", nl: "regen en wateroverlast" },
  3: { fr: "orages", nl: "onweer" },
  4: { fr: "inondation", nl: "overstroming" },
  5: { fr: "neige-verglas", nl: "sneeuw en ijzel" },
  6: { fr: "canicule", nl: "hitte" },
  7: { fr: "grand froid", nl: "strenge kou" },
  8: { fr: "avalanches", nl: "lawines" },
  9: { fr: "vagues-submersion", nl: "hoge golven en overstroming vanaf zee" },
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
  // Alleen de fenomenen die de API werkelijk noemt, op ID.
  fenomenen: Record<number, number>;
}

export interface VigilanceData {
  departementen: Record<string, Record<Termijn, VigilanceDepartement>>;
  bijgewerkt: string | null;
  // Welk basepath de respons opleverde: hoort in de README zodra het vaststaat.
  basispad: string | null;
}

type Json = unknown;

// ---------------------------------------------------------------------------
// Normalisatie. Net als bij de Météo des forêts is de exacte responsstructuur
// niet publiek gedocumenteerd. In plaats van één vorm te veronderstellen lopen
// we de hele JSON-boom door en verzamelen we (departement, fenomeen, kleur)
// binnen hun dichtstbijzijnde termijncontext. Waarden worden 1-op-1 overgenomen
// en nooit herberekend, geraden of afgerond.
// ---------------------------------------------------------------------------

const DEP_KEYS = [
  "domain_id", "domain", "dep", "departement", "department", "code_dep",
  "code_departement", "numero_dep", "insee_dep", "code", "code_insee",
];
const MAX_KLEUR_KEYS = ["max_color_id", "max_colour_id", "color_max", "niveau_max"];
const FENOMEEN_ID_KEYS = ["phenomenon_id", "phenomenon", "phenomene_id", "phenomene", "id_phenomene"];
const FENOMEEN_KLEUR_KEYS = [
  "phenomenon_max_color_id", "phenomenon_color_id", "color_id", "colour_id", "niveau", "level",
];
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

  const loop = (node: Json, termijn: Termijn | null) => {
    if (Array.isArray(node)) {
      for (const item of node) loop(item, termijn);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, Json>;

    // Termijncontext bepalen: {"echeance":"J1", ...} of een sleutel "J1".
    let hier = termijn;
    for (const [k, v] of Object.entries(obj)) {
      if (
        ["echeance", "écheance", "ech", "period", "periode", "validity", "term"].includes(
          k.toLowerCase()
        ) &&
        (typeof v === "string" || typeof v === "number")
      ) {
        const t = termijnVan(String(v));
        if (t) hier = t;
      }
    }

    if (!bijgewerkt) {
      const d = pakVeld(obj, DATE_KEYS);
      if (typeof d === "string" && d.length >= 8) bijgewerkt = d;
    }

    // Een departement in dit object? Dan geldt alles eronder voor dat
    // departement, inclusief de fenomeenlijst die eraan hangt.
    const dep = alsDepCode(pakVeld(obj, DEP_KEYS));
    if (dep) {
      // Zonder termijncontext geldt de waarde voor vandaag: dat is wat de
      // gebruiker als eerste ziet en de veiligste van de twee om te tonen.
      const t: Termijn = hier ?? "vandaag";
      const max = alsKleur(pakVeld(obj, MAX_KLEUR_KEYS));
      if (max != null && vak(dep, t).max == null) vak(dep, t).max = max;

      verzamelFenomenen(obj, dep, t);
      for (const [k, v] of Object.entries(obj)) {
        const kt = termijnVan(k);
        loopFenomeen(v, dep, kt ?? t);
      }
      return;
    }

    for (const [k, v] of Object.entries(obj)) {
      const kDep = alsDepCode(k);
      if (kDep) {
        const t: Termijn = hier ?? "vandaag";
        const n = alsKleur(v);
        if (n != null) {
          if (vak(kDep, t).max == null) vak(kDep, t).max = n;
        } else {
          loopFenomeen(v, kDep, t);
        }
        continue;
      }
      loop(v, termijnVan(k) ?? hier);
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

    let hier = termijn;
    for (const [k, v] of Object.entries(obj)) {
      if (
        ["echeance", "écheance", "ech", "period", "periode"].includes(k.toLowerCase()) &&
        (typeof v === "string" || typeof v === "number")
      ) {
        const t = termijnVan(String(v));
        if (t) hier = t;
      }
    }

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
  return { departementen, bijgewerkt, basispad: null };
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
