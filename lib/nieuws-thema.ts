// Onderwerpzeef voor het automatische nieuws in de zijlade.
// ---------------------------------------------------------------------------
// WAAROM DIT BESTAND BESTAAT. De persfeeds in data/nieuwsbronnen.ts zijn
// algemene faits-divers-feeds (Sud Ouest, Midi Libre). Het oude filter liet een
// kop door zodra er ergens "incendie" of "pompiers" in stond. Daardoor stonden
// er op 26-08-2026 in de lade onder meer een vechtpartij in Monflanquin, twee
// uitgebrande auto's in Nîmes en een ziekenhuisbrand in Islamabad. Dat hoort
// niet in een tool over bosbrandrisico.
//
// VERTREKPUNT: de zeeflogica van antonnoe/nlfr-menu (lib/config.js +
// lib/feeds.js) — de faits-divers-zeef mét Nederlandse spiegel, en de
// buitenland-laag met landen, inwonersnamen en hoofdsteden. Bewust NIET blind
// overgenomen: die tool bedient Nederlanders in Frankrijk in de volle breedte
// (belasting, wonen, staking, zorg), deze tool gaat uitsluitend over
// natuurbrandrisico. Drie aanpassingen:
//
//   1. In nlfr-menu is "incendie" een INSLUITTERM die altijd wint. Hier zou dat
//      precies de vervuiling binnenhalen die we kwijt willen. "incendie" is hier
//      een steunterm die alleen telt met natuurcontext erbij (zie hieronder).
//   2. De onderwerppoort is POSITIEF: een kop moet aantoonbaar over het
//      onderwerp gaan. In nlfr-menu is de zeef negatief (alles mag, behalve…).
//   3. De buitenlandredding is hier alleen FRANKRIJK. In nlfr-menu redden ook
//      Nederland en de EU een kop, want daar is de lezer het onderwerp. Hier is
//      het Franse brandrisico het onderwerp; een Nederlandse of Europese
//      invalshoek maakt een brand in Islamabad niet relevant.
//
// DE REGEL, in één zin: een kop komt door als hij een KERNTERM bevat, of een
// STEUNTERM samen met een NATUURTERM — en vervolgens niet sneuvelt op de
// faits-divers-zeef of de buitenland-zeef.
//
// Geen Next- of React-import, zodat alles los te testen is
// (scripts/test-nieuws-thema.ts).

export type Weigergrond = "buitenland" | "faits-divers" | "geen-onderwerp";

export interface Zeefoordeel {
  door: boolean;
  grond: Weigergrond | null; // gevuld als door === false
}

// ---- Normalisatie -----------------------------------------------------------
// Diakritische tekens weg, kleine letters, én apostroffen naar spaties. Dat
// laatste is nodig omdat de termen hieronder als losse woorden zijn geschreven:
// "qualité de l'air" wordt zo "qualite de l air" en matcht de term. Het oude
// filter had dezelfde term staan maar normaliseerde de apostrof niet weg,
// waardoor die term in de praktijk nooit matchte.
export function normaliseerKop(tekst: string): string {
  return String(tekst || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[''`’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Hele woord, grens aan beide kanten. Voor landnamen en korte termen: "chine"
// zit in "machine", "inde" in "industrie", "oman" in "roman". Overgenomen uit
// nlfr-menu (lib/feeds.js bevatWoord).
export function bevatWoord(genormaliseerd: string, term: string): boolean {
  const t = String(term || "").trim();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(genormaliseerd);
}

// Grens aan minstens één kant. Voor stammen waar samenstellingen en verbuigingen
// de regel zijn: "incendies", "brulee", "evacuees", "bosbranden". Overgenomen
// uit nlfr-menu (lib/feeds.js bevatWoordDeel).
export function bevatWoordDeel(genormaliseerd: string, term: string): boolean {
  const t = String(term || "").trim();
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`(^|[^a-z0-9])${esc}`).test(genormaliseerd) ||
    new RegExp(`${esc}([^a-z0-9]|$)`).test(genormaliseerd)
  );
}

// ---- 1. KERNTERMEN: alleen al genoeg ---------------------------------------
// Ondubbelzinnig over natuurbrand, brandrisico, droogte, hitte, luchtkwaliteit
// of een préfecture-maatregel. Een kop met zo'n term gaat door de onderwerppoort
// zonder verdere context, en redt zichzelf bovendien uit de faits-divers-zeef.
export const KERN: string[] = [
  // -- natuurbrand zelf
  "feu de foret", "feux de foret", "feu de forets", "feux de forets",
  "feu de vegetation", "feux de vegetation",
  "incendie de foret", "incendies de foret", "incendie de forets",
  "incendie de vegetation", "incendies de vegetation",
  "feu de broussailles", "feux de broussailles", "incendie de broussailles",
  "feu de garrigue", "feux de garrigue", "feu de maquis", "feux de maquis",
  "incendie de maquis", "feu de lande", "feux de landes",
  "feu de pinede", "incendie de pinede", "feu de chaume", "feux de chaume",
  "feu de recolte", "feux de recolte", "feu de moisson",
  "megafeu", "megafeux", "incendie majeur",
  "hectares brules", "hectares de foret", "hectares de vegetation",
  "hectares de pins", "hectares de maquis", "hectares de garrigue",
  "partis en fumee", "surface brulee", "surfaces brulees",
  // -- brandrisico & preventie (Météo des forêts, débroussaillement, toegang)
  "risque incendie", "risque d incendie", "risque de feu", "risque feu",
  "risques d incendie", "meteo des forets", "danger incendie", "danger de feu",
  "danger meteorologique d incendie", "indice de danger",
  "debroussaillement", "obligation legale de debroussaillement",
  "interdiction de brulage", "brulage interdit", "ecobuage",
  "acces aux massifs", "fermeture des massifs", "reouverture des massifs",
  "massif forestier", "massifs forestiers", "acces interdit aux massifs",
  "circulation interdite en foret", "interdiction de circuler en foret",
  // -- préfecture-maatregelen en herstel na brand
  "arrete prefectoral", "arrete secheresse", "arrete de catastrophe naturelle",
  "catastrophe naturelle", "zone sinistree", "zones sinistrees",
  "commune sinistree", "communes sinistrees",
  "fermeture de la chasse", "suspension de la chasse", "chasse suspendue",
  "chasse fermee", "chasse interdite", "reouverture de la chasse",
  "reboisement", "replantation", "restauration des sols",
  // -- droogte
  "secheresse", "secheresses", "restriction d eau", "restrictions d eau",
  "penurie d eau", "deficit hydrique", "nappes phreatiques",
  "alerte secheresse", "crise secheresse", "niveau des nappes",
  // -- hitte
  "canicule", "canicules", "vague de chaleur", "vagues de chaleur",
  "fortes chaleurs", "chaleur extreme", "record de chaleur",
  "vigilance canicule", "vigilance secheresse", "vigilance feux",
  // -- rook & luchtkwaliteit (alleen de ondubbelzinnige vormen; kale "fumee"
  //    staat bij de steuntermen, want die zit ook in elke schuurbrand)
  "panache de fumee", "panaches de fumee", "qualite de l air",
  "pollution de l air", "pollution atmospherique", "particules fines",
  "indice atmo", "pic de pollution", "episode de pollution",
  // -- Nederlandse spiegel (voor het geval er ooit een NL-bron bij komt)
  "bosbrand", "bosbranden", "natuurbrand", "natuurbranden",
  "brandrisico", "brandgevaar", "droogte", "hittegolf", "luchtkwaliteit",
  "code rood", "code oranje", "stookverbod",
];

// ---- 2. STEUNTERMEN: alleen genoeg mét natuurcontext -----------------------
// Dit zijn de termen die het oude filter alleen al genoeg vond, en precies
// daarom stonden er uitgebrande auto's in de lade. Ze tellen hier pas mee als
// er ook een NATUUR-term in de kop staat.
export const STEUN: string[] = [
  "incendie", "incendies", "incendiee", "incendiees", "incendie",
  "feu", "feux", "brule", "brulee", "brules", "brulees", "brulent",
  "flammes", "sinistre", "sinistres", "hectares",
  "fumee", "fumees",
  "pompier", "pompiers", "sdis", "soldats du feu", "canadair", "dash",
  "evacuation", "evacuations", "evacue", "evacues", "evacuee", "evacuees",
  "confinement", "mise a l abri",
  // Nederlandse spiegel
  "brand", "branden", "brandweer", "evacuatie", "geevacueerd", "rook",
];

// ---- 3. NATUURTERMEN: het landschap dat een brand een natuurbrand maakt -----
// LET OP bij uitbreiden: hier horen alleen woorden die in een Franse kop
// ondubbelzinnig landschap betekenen. Bewust GEEN "landes" (het departement
// Landes), "bois" (Bois-Colombes, Bois-d'Arcy) en kaal "champ" (Champs-Élysées):
// die maakten van een autobrand op de A63 in de Landes en van een
// appartementsbrand in Bois-Colombes een "natuurbrand". Gemeten met
// scripts/test-nieuws-thema.ts, sectie 7.
export const NATUUR: string[] = [
  "foret", "forets", "forestier", "forestiere", "forestiers",
  "vegetation", "broussailles", "garrigue", "garrigues", "maquis",
  "pinede", "pinedes", "pins", "pin maritime",
  "massif", "massifs", "colline", "collines", "coteau", "coteaux",
  "boise", "boisee", "sous-bois", "bosquet", "taillis",
  "chaume", "chaumes", "recolte", "recoltes", "moisson",
  "champ de ble", "champs de ble", "champ de mais", "champ de colza",
  "champ de paille", "plein champ",
  "dune", "dunes", "parc naturel", "reserve naturelle", "espace naturel",
  "prairie", "prairies", "friche", "friches",
  "camping", "campings", // campings zijn de standaard-evacuatie bij natuurbrand
  // Nederlandse spiegel
  "bos", "bossen", "natuurgebied", "duinen", "heide", "struikgewas",
];

// ---- 4. Faits-divers-zeef ---------------------------------------------------
// Overgenomen uit nlfr-menu (FAITS_DIVERS_UIT + FAITS_DIVERS_UIT_NL). Anders dan
// daar is er hier maar één redding: een KERNTERM. In nlfr-menu redt een brede
// insluitlijst (waaronder kaal "incendie") een kop; dat zou hier de vervuiling
// terugbrengen.
export const FAITS_DIVERS_UIT: string[] = [
  "viol", "viols", "violee", "meurtre", "meurtrier", "cadavre",
  "tue", "tuee", "poignarde", "poignardee", "agression", "agresse",
  "garde a vue", "drogue", "cocaine", "ecstasy", "heroine", "cannabis",
  "stupefiant", "stupefiants", "homicide", "feminicide", "fusillade",
  "braquage", "overdose", "proxenetisme", "pedophilie", "pedophile",
  "coups de couteau", "sequestration", "enlevement", "assassinat",
  "par balle", "reglement de compte", "narcotrafic", "rixe", "rixes",
  "bagarre", "bagarres", "noyade", "noyee", "noye",
  "portee disparue", "porte disparu", "corps sans vie", "sans vie",
  "retrouve mort", "retrouvee morte", "accident de la route",
  "delit de fuite", "ivresse", "alcoolemie", "cambriolage", "vol a main armee",
];

// Nederlandse spiegel van dezelfde zeef. Op woordgrens getoetst, niet als losse
// substring: "dood" zit in "doodgewoon". Daarom alleen ondubbelzinnige stammen.
export const FAITS_DIVERS_UIT_NL: string[] = [
  "aangehouden", "aanhouding", "opgepakt", "gearresteerd", "arrestatie",
  "celstraf", "voorarrest", "aanklacht",
  "moord", "doodslag", "gedood", "omgebracht", "doodgestoken", "doodgeschoten",
  "neergestoken", "neergeschoten", "steekpartij", "schietpartij", "vechtpartij",
  "dood aangetroffen", "levenloos aangetroffen", "dood gevonden",
  "vermist", "vermissing", "verdronken", "verdrinking", "drenkeling",
  "huiselijk geweld", "mishandeld", "mishandeling", "misbruik", "aanranding",
  "verkracht", "verkrachting", "zedenzaak", "ontvoerd", "ontvoering",
  "drugs", "cocaine", "wietplantage", "witwassen", "inbraak", "overval",
];

// ---- 5. Buitenland-zeef -----------------------------------------------------
// Landen, inwonersnamen én hoofdsteden, Frans en Nederlands — de derde laag uit
// nlfr-menu, hier aangevuld met de hoofdsteden die daar ontbraken (Islamabad
// stond er niet in, en juist die kop haalde de lade). Op WOORDGRENS getoetst.
export const BUITENLAND: string[] = [
  // Latijns-Amerika
  "guatemala", "guatemalteque", "colombie", "colombien", "colombienne",
  "colombia", "colombiaans", "colombiaanse", "venezuela", "venezuelien",
  "perou", "peru", "chili", "bolivie", "bolivia", "equateur", "ecuador",
  "mexique", "mexico", "mexicain", "mexicaans", "argentine", "argentinie",
  "argentijnse", "bresil", "brazilie", "braziliaans", "cuba", "haiti",
  "honduras", "nicaragua", "panama", "bogota", "caracas", "lima",
  "buenos aires", "brasilia", "santiago", "la havane",
  // Noord-Amerika
  "etats-unis", "etats unis", "americain", "americaine", "washington",
  "trump", "californie", "californian", "floride", "florida", "texas",
  "new york", "los angeles", "verenigde staten", "amerika", "amerikaan",
  "amerikaanse", "canada", "canadien", "canadese", "ottawa", "montreal",
  // Afrika
  "nigeria", "kenya", "kenia", "nairobi", "ethiopie", "ethiopia",
  "addis abeba", "soudan", "sudan", "khartoum", "somalie", "somalia",
  "mogadiscio", "mali", "bamako", "niger", "niamey", "tchad", "tsjaad",
  "burkina", "ouagadougou", "senegal", "dakar", "cameroun", "kameroen",
  "yaounde", "congo", "kinshasa", "rwanda", "kigali", "ouganda", "oeganda",
  "kampala", "tanzanie", "tanzania", "zimbabwe", "harare",
  "afrique du sud", "zuid-afrika", "pretoria", "le cap",
  "egypte", "egyptisch", "le caire", "caire", "cairo", "libye", "libie",
  "tripoli", "tunisie", "tunesie", "tunis", "algerie", "algerije",
  "algerien", "alger", "maroc", "marocain", "marocaine", "marokko",
  "marokkaan", "marokkaanse", "rabat", "casablanca", "ceuta", "melilla",
  // Azië
  "chine", "china", "chinois", "chinese", "pekin", "beijing", "shanghai",
  "inde", "india", "indiase", "new delhi", "delhi", "bombay", "mumbai",
  "pakistan", "pakistanais", "pakistaanse", "islamabad", "karachi", "lahore",
  "bangladesh", "dacca", "dhaka", "afghanistan", "kaboul", "kabul",
  "indonesie", "indonesia", "jakarta", "philippines", "filipijnen", "manille",
  "manila", "vietnam", "hanoi", "thailande", "thailand", "bangkok",
  "birmanie", "myanmar", "coree", "korea", "seoul", "pyongyang",
  "japon", "japan", "tokyo", "tokio", "nepal", "katmandou",
  "sri lanka", "colombo", "kazakhstan", "kazachstan", "astana",
  // Midden-Oosten
  "israel", "israelien", "israelienne", "israelisch", "israelische",
  "tel aviv", "jerusalem", "gaza", "cisjordanie", "westelijke jordaanoever",
  "netanyahou", "hamas", "iran", "iranien", "iraans", "iraanse", "teheran",
  "syrie", "syrisch", "damas", "damascus", "irak", "iraq", "bagdad",
  "liban", "libanon", "beyrouth", "yemen", "jemen", "sanaa",
  "arabie saoudite", "saoedi-arabie", "riyad", "qatar", "doha",
  "emirats", "dubai", "abou dabi", "turquie", "turkije", "ankara", "istanbul",
  // Oekraïne / Rusland
  "ukraine", "oekraine", "oekraiense", "kiev", "kyiv", "poutine", "poetin",
  "moscou", "moskou", "kremlin", "russie", "rusland", "russisch", "russische",
  // Europa buiten Frankrijk (buurlanden bewust weggelaten: nieuws daar gaat
  // vaak direct over de grens met Frankrijk)
  "espagne", "espagnol", "espagnole", "spanje", "spaans", "spaanse",
  "madrid", "barcelone", "barcelona", "italie", "italien", "italienne",
  "italiaan", "italiaanse", "rome", "naples", "milan", "allemagne",
  "allemand", "allemande", "duitsland", "duitse", "berlin", "berlijn",
  "portugal", "portugais", "portugese", "lisbonne", "lissabon",
  "londres", "londen", "angleterre", "engeland", "engelse",
  "royaume-uni", "groot-brittannie", "grece", "griekenland", "athenes",
  "athene", "pologne", "polen", "varsovie", "warschau", "hongrie",
  "hongarije", "budapest", "roumanie", "roemenie", "bucarest",
  "bulgarie", "bulgarije", "sofia", "suede", "zweden", "stockholm",
  "norvege", "noorwegen", "oslo", "finlande", "finland", "helsinki",
  "danemark", "denemarken", "copenhague", "irlande", "ierland", "dublin",
  "autriche", "oostenrijk", "vienne", "wenen", "prague", "praag",
  "serbie", "servie", "belgrade", "croatie", "kroatie", "zagreb",
  "albanie", "tirana", "turkse",
  // mondiaal sportbestuur en techbedrijven (nooit Frans brandrisico)
  "fifa", "uefa", "infantino", "silicon valley", "wall street", "spacex",
];

// Redding voor de buitenland-zeef: noemt de kop Frankrijk, dan blijft hij staan.
// Bewust ALLEEN Frankrijk — anders dan in nlfr-menu, waar Nederland en de EU ook
// redden. Overgenomen en licht uitgebreid met de brandregio's.
export const FRANKRIJK: string[] = [
  "france", "francais", "francaise", "francaises", "hexagone", "francophone",
  "frankrijk", "frans", "franse", "fransen",
  "paris", "parijs", "marseille", "lyon", "bordeaux", "toulouse", "nice",
  "montpellier", "cannes", "corse", "corsica", "bretagne", "normandie",
  "provence", "occitanie", "aquitaine", "nouvelle-aquitaine",
  "gironde", "landes", "var", "aude", "herault", "gard", "bouches-du-rhone",
  "pyrenees", "dordogne", "ardeche", "drome", "vaucluse", "alpes",
  "cote d azur", "riviera", "arcachon", "la teste", "landiras",
  "macron", "prefet", "prefecture", "meteo-france", "meteo france",
];

// ---- De zeef ----------------------------------------------------------------

// Gaat deze kop aantoonbaar over het onderwerp van deze tool?
// KERN alleen is genoeg; een STEUN-term telt pas mee met NATUUR erbij.
export function gaatOverOnderwerp(titel: string): boolean {
  const n = normaliseerKop(titel);
  if (heeftKern(n)) return true;
  const steun = STEUN.some((w) => bevatWoordDeel(n, w));
  if (!steun) return false;
  return NATUUR.some((w) => bevatWoordDeel(n, w));
}

function heeftKern(genormaliseerd: string): boolean {
  return KERN.some((w) => bevatWoordDeel(genormaliseerd, w));
}

// True = doorlaten. Misdaad en losse ongevallen eruit; een KERNTERM redt de kop,
// zodat "Incendie de forêt: un homme en garde à vue" wél blijft staan.
export function faitsDiversDoorlaat(titel: string): boolean {
  const n = normaliseerKop(titel);
  if (heeftKern(n)) return true;
  if (FAITS_DIVERS_UIT.some((w) => bevatWoordDeel(n, w))) return false;
  if (FAITS_DIVERS_UIT_NL.some((w) => bevatWoordDeel(n, w))) return false;
  return true;
}

// True = doorlaten. Buitenlands nieuws eruit, tenzij de kop Frankrijk noemt.
export function buitenlandDoorlaat(titel: string): boolean {
  const n = normaliseerKop(titel);
  const buitenland = BUITENLAND.some((w) => bevatWoord(n, w));
  if (!buitenland) return true;
  return FRANKRIJK.some((w) => bevatWoord(n, w));
}

// Het volledige oordeel over één kop, met de grond van weigering erbij zodat de
// route en de tests kunnen tellen wáárom iets sneuvelt.
export function beoordeelKop(titel: string): Zeefoordeel {
  if (!buitenlandDoorlaat(titel)) return { door: false, grond: "buitenland" };
  if (!faitsDiversDoorlaat(titel)) return { door: false, grond: "faits-divers" };
  if (!gaatOverOnderwerp(titel)) return { door: false, grond: "geen-onderwerp" };
  return { door: true, grond: null };
}

// Kortste vorm voor het filterpad.
export function kopDoorlaat(titel: string): boolean {
  return beoordeelKop(titel).door;
}
