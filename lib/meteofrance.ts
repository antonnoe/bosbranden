// Server-side koppeling met de Météo-France "Météo des forêts"-API.
// Enige databron: GET {BASIS}/carte/encours met API-key in de `apikey`-header.
// De key staat uitsluitend in de Vercel env var METEOFRANCE_API_KEY.

import { DEP_BY_CODE } from "@/lib/departements";

export const MF_BASIS = "https://public-api.meteofrance.fr/public/DPMeteoForets/v1";
export const CACHE_SECONDEN = 6 * 60 * 60; // 6 uur

export interface DangerData {
  // per departementcode ("01" … "95", "2A", "2B") niveau 1–4 of null
  niveaus: Record<string, { j1: number | null; j2: number | null }>;
  // productie-/updatedatum zoals de API die meegeeft (ISO-string indien gevonden)
  bijgewerkt: string | null;
  // datums van de kaarten zelf, indien de API die meegeeft
  datumJ1: string | null;
  datumJ2: string | null;
}

export async function haalRuweKaartOp(): Promise<{ status: number; body: string }> {
  const key = process.env.METEOFRANCE_API_KEY;
  if (!key) {
    throw new Error("METEOFRANCE_API_KEY ontbreekt (Vercel env var).");
  }
  const res = await fetch(`${MF_BASIS}/carte/encours`, {
    headers: { apikey: key, accept: "*/*" },
    next: { revalidate: CACHE_SECONDEN },
  });
  const body = await res.text();
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Normalisatie. De exacte responsstructuur van /carte/encours is niet publiek
// gedocumenteerd buiten het (ingelogde) API-portaal; daarom ondersteunen we de
// bekende vormen van Météo-France-portaal-API's en rapporteert /api/debug de
// werkelijke structuur. Niveauwaarden worden 1-op-1 overgenomen (nooit
// herberekend of afgerond).
// ---------------------------------------------------------------------------

type Json = unknown;

const DEP_KEYS = [
  "domain_id", "domain", "dep", "departement", "department", "code_dep",
  "code_departement", "numero_dep", "insee_dep", "code", "code_insee",
];
const LEVEL_KEYS = [
  "niveau", "level", "color_id", "colour_id", "max_color_id",
  "phenomenon_max_color_id", "dmf", "danger", "risque", "valeur", "value",
];
const DATE_KEYS = [
  "update_time", "updated_at", "date_production", "dateproduction",
  "production_date", "reference_time", "basetime", "date_publication",
  "publication_date", "date_diffusion", "diffusion_date", "created_at",
  "maj", "date_maj", "datemaj", "mise_a_jour", "derniere_maj",
];
const ECH_J1 = ["j1", "j+1", "demain", "tomorrow"];
const ECH_J2 = ["j2", "j+2"];

function alsDepCode(v: Json): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  let s = String(v).trim().toUpperCase();
  if (/^\d{1}$/.test(s)) s = "0" + s;
  if (/^(FR)?(\d{2}|2A|2B)$/.test(s)) s = s.replace(/^FR/, "");
  if (s.length === 5 && /^\d{5}$/.test(s)) s = s.slice(0, 2); // INSEE-achtig
  return DEP_BY_CODE[s] ? s : null;
}

function alsNiveau(v: Json): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

function pakVeld(obj: Record<string, Json>, namen: string[]): Json {
  for (const [k, v] of Object.entries(obj)) {
    if (namen.includes(k.toLowerCase())) return v;
  }
  return undefined;
}

function echeanceVan(s: string): "j1" | "j2" | null {
  const t = s.toLowerCase().replace(/\s/g, "");
  if (ECH_J1.some((e) => t === e || t.includes(e))) return "j1";
  if (ECH_J2.some((e) => t === e || t.includes(e))) return "j2";
  return null;
}

// Doorloop de hele JSON-boom en verzamel (departement, niveau)-paren binnen
// hun dichtstbijzijnde echéance-context (J1/J2), plus datumvelden.
export function normaliseer(raw: Json): DangerData {
  const niveaus: DangerData["niveaus"] = {};
  let bijgewerkt: string | null = null;
  let datumJ1: string | null = null;
  let datumJ2: string | null = null;

  const zet = (dep: string, ech: "j1" | "j2" | null, niveau: number) => {
    if (!niveaus[dep]) niveaus[dep] = { j1: null, j2: null };
    if (ech === "j2") {
      if (niveaus[dep].j2 == null) niveaus[dep].j2 = niveau;
    } else if (ech === "j1") {
      if (niveaus[dep].j1 == null) niveaus[dep].j1 = niveau;
    } else {
      // geen echéance-context: eerst J1 vullen, daarna J2
      if (niveaus[dep].j1 == null) niveaus[dep].j1 = niveau;
      else if (niveaus[dep].j2 == null) niveaus[dep].j2 = niveau;
    }
  };

  const loop = (node: Json, ech: "j1" | "j2" | null) => {
    if (Array.isArray(node)) {
      for (const item of node) loop(item, ech);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, Json>;

    // echéance-context bepalen (bijv. {"echeance":"J1", ...} of key "J1")
    let hier = ech;
    for (const [k, v] of Object.entries(obj)) {
      if (["echeance", "écheance", "ech", "validity", "period", "moment"].includes(k.toLowerCase()) && typeof v === "string") {
        const e = echeanceVan(v);
        if (e) hier = e;
      }
    }

    // datums verzamelen
    if (!bijgewerkt) {
      const d = pakVeld(obj, DATE_KEYS);
      if (typeof d === "string" && d.length >= 8) bijgewerkt = d;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string" || v.length < 8) continue;
      const kl = k.toLowerCase();
      if (kl.includes("date") || kl.includes("time")) {
        const e = echeanceVan(kl);
        if (e === "j1" && !datumJ1) datumJ1 = v;
        if (e === "j2" && !datumJ2) datumJ2 = v;
      }
    }

    // (departement, niveau)-paar in ditzelfde object?
    const depRaw = pakVeld(obj, DEP_KEYS);
    const dep = alsDepCode(depRaw);
    if (dep) {
      const niveau = alsNiveau(pakVeld(obj, LEVEL_KEYS));
      if (niveau != null) zet(dep, hier, niveau);
      // vorm {"dep":"01","j1":2,"j2":3}
      for (const [k, v] of Object.entries(obj)) {
        const e = echeanceVan(k);
        const n = alsNiveau(v);
        if (e && n != null) zet(dep, e, n);
      }
    }

    // vorm {"01": 2, "2A": 3, ...} — departementcodes als sleutels
    for (const [k, v] of Object.entries(obj)) {
      const kDep = alsDepCode(k);
      if (kDep) {
        const n = alsNiveau(v);
        if (n != null) zet(kDep, hier, n);
        else loop(v, hier);
        continue;
      }
      const e = echeanceVan(k);
      loop(v, e ?? hier);
    }
  };

  loop(raw, null);
  return { niveaus, bijgewerkt, datumJ1, datumJ2 };
}

// ---------------------------------------------------------------------------
// CSV-parsing. De werkelijke respons van /carte/encours is puntkomma-CSV:
//   reference_time;dep_code;niveau_j1;niveau_j2;dep_nom
//   2026-07-06T14:50:06Z;11;3;4;Aude
// De kolommen worden op naam herkend (headerregel), met de bovenstaande
// volgorde als terugval wanneer een headerregel ontbreekt.
// ---------------------------------------------------------------------------

export function normaliseerCsv(tekst: string): DangerData | null {
  const regels = tekst
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (regels.length === 0) return null;

  let kolommen = { ref: 0, dep: 1, j1: 2, j2: 3 };
  let start = 0;

  const kop = regels[0].split(";").map((k) => k.trim().toLowerCase());
  const isHeader = kop.some((k) => /[a-z_]{3,}/.test(k) && !/^\d/.test(k)) && alsDepCode(kop[1]) === null;
  if (isHeader) {
    start = 1;
    const vind = (test: (k: string) => boolean, terugval: number) => {
      const i = kop.findIndex(test);
      return i >= 0 ? i : terugval;
    };
    kolommen = {
      ref: vind((k) => k.includes("time") || k.includes("date") || k.includes("reference"), 0),
      dep: vind((k) => k.includes("dep") && k.includes("code"), 1),
      j1: vind((k) => k.includes("j1") || k.includes("j+1"), 2),
      j2: vind((k) => k.includes("j2") || k.includes("j+2"), 3),
    };
  }

  const niveaus: DangerData["niveaus"] = {};
  let bijgewerkt: string | null = null;

  for (const regel of regels.slice(start)) {
    const velden = regel.split(";").map((v) => v.trim());
    const dep = alsDepCode(velden[kolommen.dep]);
    if (!dep) continue;
    niveaus[dep] = {
      j1: alsNiveau(velden[kolommen.j1]),
      j2: alsNiveau(velden[kolommen.j2]),
    };
    const ref = velden[kolommen.ref];
    if (!bijgewerkt && ref && ref.length >= 8) bijgewerkt = ref;
  }

  if (Object.keys(niveaus).length === 0) return null;
  return { niveaus, bijgewerkt, datumJ1: null, datumJ2: null };
}

// Verwerkt een ruwe respons-body: JSON indien mogelijk, anders CSV.
export function verwerkBody(body: string): {
  vorm: "json" | "csv" | "onbekend";
  raw: unknown;
  data: DangerData | null;
} {
  try {
    const raw = JSON.parse(body);
    return { vorm: "json", raw, data: normaliseer(raw) };
  } catch {
    // geen JSON: probeer puntkomma-CSV
  }
  const data = normaliseerCsv(body);
  if (data) return { vorm: "csv", raw: body.split(/\r?\n/).slice(0, 5), data };
  return { vorm: "onbekend", raw: body.slice(0, 500), data: null };
}

// Compacte structuurschets van een JSON-waarde (voor /api/debug):
// sleutels + types, arrays tot 2 voorbeelditems.
export function structuurSchets(node: Json, diepte = 0): Json {
  if (diepte > 6) return "…";
  if (Array.isArray(node)) {
    return {
      __type: `array(${node.length})`,
      items: node.slice(0, 2).map((n) => structuurSchets(n, diepte + 1)),
    };
  }
  if (node === null) return "null";
  if (typeof node === "object") {
    const uit: Record<string, Json> = {};
    for (const [k, v] of Object.entries(node as Record<string, Json>)) {
      uit[k] = structuurSchets(v, diepte + 1);
    }
    return uit;
  }
  if (typeof node === "string") return node.length > 60 ? node.slice(0, 60) + "…" : node;
  return node;
}
