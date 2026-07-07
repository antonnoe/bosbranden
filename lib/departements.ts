// Alle 96 metropolitane departementen (incl. Corsica 2A/2B).
// Prefectuur-URL's volgen het patroon https://www.<slug>.gouv.fr
// Enige afwijking: Paris (75) — de préfectuur van Parijs/Île-de-France heeft
// geen eigen paris.gouv.fr en zit op prefectures-regions.gouv.fr.

export interface Departement {
  code: string;
  naam: string;
  prefectuurUrl: string;
}

const p = (slug: string) => `https://www.${slug}.gouv.fr`;

export const DEPARTEMENTEN: Departement[] = [
  { code: "01", naam: "Ain", prefectuurUrl: p("ain") },
  { code: "02", naam: "Aisne", prefectuurUrl: p("aisne") },
  { code: "03", naam: "Allier", prefectuurUrl: p("allier") },
  { code: "04", naam: "Alpes-de-Haute-Provence", prefectuurUrl: p("alpes-de-haute-provence") },
  { code: "05", naam: "Hautes-Alpes", prefectuurUrl: p("hautes-alpes") },
  { code: "06", naam: "Alpes-Maritimes", prefectuurUrl: p("alpes-maritimes") },
  { code: "07", naam: "Ardèche", prefectuurUrl: p("ardeche") },
  { code: "08", naam: "Ardennes", prefectuurUrl: p("ardennes") },
  { code: "09", naam: "Ariège", prefectuurUrl: p("ariege") },
  { code: "10", naam: "Aube", prefectuurUrl: p("aube") },
  { code: "11", naam: "Aude", prefectuurUrl: p("aude") },
  { code: "12", naam: "Aveyron", prefectuurUrl: p("aveyron") },
  { code: "13", naam: "Bouches-du-Rhône", prefectuurUrl: p("bouches-du-rhone") },
  { code: "14", naam: "Calvados", prefectuurUrl: p("calvados") },
  { code: "15", naam: "Cantal", prefectuurUrl: p("cantal") },
  { code: "16", naam: "Charente", prefectuurUrl: p("charente") },
  { code: "17", naam: "Charente-Maritime", prefectuurUrl: p("charente-maritime") },
  { code: "18", naam: "Cher", prefectuurUrl: p("cher") },
  { code: "19", naam: "Corrèze", prefectuurUrl: p("correze") },
  { code: "2A", naam: "Corse-du-Sud", prefectuurUrl: p("corse-du-sud") },
  { code: "2B", naam: "Haute-Corse", prefectuurUrl: p("haute-corse") },
  { code: "21", naam: "Côte-d'Or", prefectuurUrl: p("cote-dor") },
  { code: "22", naam: "Côtes-d'Armor", prefectuurUrl: p("cotes-darmor") },
  { code: "23", naam: "Creuse", prefectuurUrl: p("creuse") },
  { code: "24", naam: "Dordogne", prefectuurUrl: p("dordogne") },
  { code: "25", naam: "Doubs", prefectuurUrl: p("doubs") },
  { code: "26", naam: "Drôme", prefectuurUrl: p("drome") },
  { code: "27", naam: "Eure", prefectuurUrl: p("eure") },
  { code: "28", naam: "Eure-et-Loir", prefectuurUrl: p("eure-et-loir") },
  { code: "29", naam: "Finistère", prefectuurUrl: p("finistere") },
  { code: "30", naam: "Gard", prefectuurUrl: p("gard") },
  { code: "31", naam: "Haute-Garonne", prefectuurUrl: p("haute-garonne") },
  { code: "32", naam: "Gers", prefectuurUrl: p("gers") },
  { code: "33", naam: "Gironde", prefectuurUrl: p("gironde") },
  { code: "34", naam: "Hérault", prefectuurUrl: p("herault") },
  { code: "35", naam: "Ille-et-Vilaine", prefectuurUrl: p("ille-et-vilaine") },
  { code: "36", naam: "Indre", prefectuurUrl: p("indre") },
  { code: "37", naam: "Indre-et-Loire", prefectuurUrl: p("indre-et-loire") },
  { code: "38", naam: "Isère", prefectuurUrl: p("isere") },
  { code: "39", naam: "Jura", prefectuurUrl: p("jura") },
  { code: "40", naam: "Landes", prefectuurUrl: p("landes") },
  { code: "41", naam: "Loir-et-Cher", prefectuurUrl: p("loir-et-cher") },
  { code: "42", naam: "Loire", prefectuurUrl: p("loire") },
  { code: "43", naam: "Haute-Loire", prefectuurUrl: p("haute-loire") },
  { code: "44", naam: "Loire-Atlantique", prefectuurUrl: p("loire-atlantique") },
  { code: "45", naam: "Loiret", prefectuurUrl: p("loiret") },
  { code: "46", naam: "Lot", prefectuurUrl: p("lot") },
  { code: "47", naam: "Lot-et-Garonne", prefectuurUrl: p("lot-et-garonne") },
  { code: "48", naam: "Lozère", prefectuurUrl: p("lozere") },
  { code: "49", naam: "Maine-et-Loire", prefectuurUrl: p("maine-et-loire") },
  { code: "50", naam: "Manche", prefectuurUrl: p("manche") },
  { code: "51", naam: "Marne", prefectuurUrl: p("marne") },
  { code: "52", naam: "Haute-Marne", prefectuurUrl: p("haute-marne") },
  { code: "53", naam: "Mayenne", prefectuurUrl: p("mayenne") },
  { code: "54", naam: "Meurthe-et-Moselle", prefectuurUrl: p("meurthe-et-moselle") },
  { code: "55", naam: "Meuse", prefectuurUrl: p("meuse") },
  { code: "56", naam: "Morbihan", prefectuurUrl: p("morbihan") },
  { code: "57", naam: "Moselle", prefectuurUrl: p("moselle") },
  { code: "58", naam: "Nièvre", prefectuurUrl: p("nievre") },
  { code: "59", naam: "Nord", prefectuurUrl: p("nord") },
  { code: "60", naam: "Oise", prefectuurUrl: p("oise") },
  { code: "61", naam: "Orne", prefectuurUrl: p("orne") },
  { code: "62", naam: "Pas-de-Calais", prefectuurUrl: p("pas-de-calais") },
  { code: "63", naam: "Puy-de-Dôme", prefectuurUrl: p("puy-de-dome") },
  { code: "64", naam: "Pyrénées-Atlantiques", prefectuurUrl: p("pyrenees-atlantiques") },
  { code: "65", naam: "Hautes-Pyrénées", prefectuurUrl: p("hautes-pyrenees") },
  { code: "66", naam: "Pyrénées-Orientales", prefectuurUrl: p("pyrenees-orientales") },
  { code: "67", naam: "Bas-Rhin", prefectuurUrl: p("bas-rhin") },
  { code: "68", naam: "Haut-Rhin", prefectuurUrl: p("haut-rhin") },
  { code: "69", naam: "Rhône", prefectuurUrl: p("rhone") },
  { code: "70", naam: "Haute-Saône", prefectuurUrl: p("haute-saone") },
  { code: "71", naam: "Saône-et-Loire", prefectuurUrl: p("saone-et-loire") },
  { code: "72", naam: "Sarthe", prefectuurUrl: p("sarthe") },
  { code: "73", naam: "Savoie", prefectuurUrl: p("savoie") },
  { code: "74", naam: "Haute-Savoie", prefectuurUrl: p("haute-savoie") },
  { code: "75", naam: "Paris", prefectuurUrl: "https://www.prefectures-regions.gouv.fr/ile-de-france" },
  { code: "76", naam: "Seine-Maritime", prefectuurUrl: p("seine-maritime") },
  { code: "77", naam: "Seine-et-Marne", prefectuurUrl: p("seine-et-marne") },
  { code: "78", naam: "Yvelines", prefectuurUrl: p("yvelines") },
  { code: "79", naam: "Deux-Sèvres", prefectuurUrl: p("deux-sevres") },
  { code: "80", naam: "Somme", prefectuurUrl: p("somme") },
  { code: "81", naam: "Tarn", prefectuurUrl: p("tarn") },
  { code: "82", naam: "Tarn-et-Garonne", prefectuurUrl: p("tarn-et-garonne") },
  { code: "83", naam: "Var", prefectuurUrl: p("var") },
  { code: "84", naam: "Vaucluse", prefectuurUrl: p("vaucluse") },
  { code: "85", naam: "Vendée", prefectuurUrl: p("vendee") },
  { code: "86", naam: "Vienne", prefectuurUrl: p("vienne") },
  { code: "87", naam: "Haute-Vienne", prefectuurUrl: p("haute-vienne") },
  { code: "88", naam: "Vosges", prefectuurUrl: p("vosges") },
  { code: "89", naam: "Yonne", prefectuurUrl: p("yonne") },
  { code: "90", naam: "Territoire de Belfort", prefectuurUrl: p("territoire-de-belfort") },
  { code: "91", naam: "Essonne", prefectuurUrl: p("essonne") },
  { code: "92", naam: "Hauts-de-Seine", prefectuurUrl: p("hauts-de-seine") },
  { code: "93", naam: "Seine-Saint-Denis", prefectuurUrl: p("seine-saint-denis") },
  { code: "94", naam: "Val-de-Marne", prefectuurUrl: p("val-de-marne") },
  { code: "95", naam: "Val-d'Oise", prefectuurUrl: p("val-doise") },
];

export const DEP_BY_CODE: Record<string, Departement> = Object.fromEntries(
  DEPARTEMENTEN.map((d) => [d.code, d])
);

export type PostcodeResultaat =
  | { type: "ok"; departementen: Departement[] }
  | { type: "buiten-metropole" }
  | { type: "ongeldig" }
  | { type: "onbekend" };

// Eerste 2 cijfers van de postcode = departementcode.
// 20xxx (Corsica) → zowel 2A als 2B tonen; 97/98 → alleen métropole-melding.
export function departementVoorPostcode(postcode: string): PostcodeResultaat {
  const pc = postcode.trim();
  if (!/^\d{5}$/.test(pc)) return { type: "ongeldig" };
  const prefix = pc.slice(0, 2);
  if (prefix === "97" || prefix === "98") return { type: "buiten-metropole" };
  if (prefix === "20") {
    return { type: "ok", departementen: [DEP_BY_CODE["2A"], DEP_BY_CODE["2B"]] };
  }
  const dep = DEP_BY_CODE[prefix];
  if (!dep) return { type: "onbekend" };
  return { type: "ok", departementen: [dep] };
}
