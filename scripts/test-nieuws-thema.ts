// Offline zelftest voor de onderwerpzeef (lib/nieuws-thema.ts). Geen netwerk.
// Draaien:  node --experimental-strip-types scripts/test-nieuws-thema.ts
//
// De negatieve gevallen zijn de koppen die op 26-08-2026 daadwerkelijk in de
// lade stonden (voor zover vastgesteld, zie README) plus het soort materiaal dat
// de faits-divers-feeds dagelijks leveren. De positieve gevallen zijn de
// Gironde-berichten die er nadrukkelijk WEL in horen.

import assert from "node:assert/strict";
import {
  beoordeelKop,
  buitenlandDoorlaat,
  faitsDiversDoorlaat,
  gaatOverOnderwerp,
  kopDoorlaat,
  normaliseerKop,
  bevatWoord,
  bevatWoordDeel,
  type Weigergrond,
} from "../lib/nieuws-thema.ts";

let geslaagd = 0;
function check(voorwaarde: boolean, bericht: string) {
  assert.ok(voorwaarde, bericht);
  geslaagd += 1;
}

// --- 1. Normalisatie --------------------------------------------------------
check(
  normaliseerKop("Qualité de l'air dégradée") === "qualite de l air degradee",
  "apostrof moet een spatie worden, zodat 'qualite de l air' matcht"
);
check(
  normaliseerKop("Forêt  brûlée") === "foret brulee",
  "accenten weg en dubbele spaties samengevoegd"
);
check(bevatWoord("une machine agricole", "chine") === false, "'chine' mag niet in 'machine' matchen");
check(bevatWoord("la chine investit", "chine") === true, "'chine' als los woord moet matchen");
check(bevatWoordDeel("les incendies de foret", "incendie") === true, "stam moet verbuiging vangen");

// --- 2. De acht items van 26-08: negatieve gevallen -------------------------
// Drie koppen zijn door Anton benoemd; de overige vijf konden niet worden
// opgehaald (netwerktoegang geblokkeerd). Ze staan hier als het type dat de
// faits-divers-feeds leveren, niet als geverifieerde live koppen.
interface Geval {
  titel: string;
  grond: Weigergrond;
  bron: "gemeld" | "typisch";
}

const NEGATIEF: Geval[] = [
  // -- door Anton live vastgesteld op 26-08-2026
  {
    titel: "Monflanquin : une rixe éclate en pleine rue, les pompiers interviennent",
    grond: "faits-divers",
    bron: "gemeld",
  },
  {
    titel: "Nîmes : deux voitures incendiées dans la nuit sur un parking",
    grond: "geen-onderwerp",
    bron: "gemeld",
  },
  {
    titel: "Islamabad : un incendie dans un hôpital fait plusieurs victimes",
    grond: "buitenland",
    bron: "gemeld",
  },
  // -- typisch materiaal uit dezelfde faits-divers-feeds
  {
    titel: "Bordeaux : un homme placé en garde à vue après une agression",
    grond: "faits-divers",
    bron: "typisch",
  },
  {
    titel: "Béziers : accident de la route mortel sur la départementale",
    grond: "faits-divers",
    bron: "typisch",
  },
  {
    titel: "Montpellier : un entrepôt détruit par les flammes, aucun blessé",
    grond: "geen-onderwerp",
    bron: "typisch",
  },
  {
    titel: "Toulouse : évacuation d'un immeuble après une fuite de gaz",
    grond: "geen-onderwerp",
    bron: "typisch",
  },
  {
    titel: "Californie : les pompiers luttent contre un feu de forêt géant",
    grond: "buitenland",
    bron: "typisch",
  },
];

for (const geval of NEGATIEF) {
  const oordeel = beoordeelKop(geval.titel);
  check(oordeel.door === false, `moet worden geweigerd: ${geval.titel}`);
  check(
    oordeel.grond === geval.grond,
    `grond moet '${geval.grond}' zijn, was '${oordeel.grond}': ${geval.titel}`
  );
}

// --- 3. Positieve gevallen: dit moet er nadrukkelijk WEL in -----------------
const POSITIEF: string[] = [
  // Anton benoemd: gesloten jacht en de getroffen gebieden in de Gironde
  "Gironde : la chasse reste fermée dans les zones sinistrées par les incendies",
  "Gironde : la préfecture prolonge la fermeture de la chasse jusqu'en octobre",
  "Gironde : la réouverture des massifs forestiers se fera par étapes",
  "Landiras : où en sont les zones sinistrées un an après le feu de forêt ?",
  // natuurbrand
  "Gironde : un feu de végétation parcourt 200 hectares à La Teste-de-Buch",
  "Var : incendie de forêt maîtrisé après une nuit de lutte",
  "Aude : 150 hectares brûlés, les campings évacués par précaution",
  // brandrisico & preventie
  "Météo des forêts : risque d'incendie très élevé sur le pourtour méditerranéen",
  "Landes : l'accès aux massifs forestiers interdit ce week-end",
  "Obligation légale de débroussaillement : ce qui change cette année",
  // droogte & hitte
  "Sécheresse : de nouvelles restrictions d'eau dans dix départements",
  "Canicule : vigilance canicule en Nouvelle-Aquitaine à partir de mardi",
  // rook & luchtkwaliteit
  "Qualité de l'air dégradée en Gironde à cause des fumées de l'incendie",
  "Un panache de fumée visible depuis Bordeaux",
  // evacuatie mét natuurcontext
  "Var : évacuation préventive de trois campings à cause du feu de broussailles",
  // de KERN-redding: misdaadterm mag een natuurbrandkop niet wegfilteren
  "Incendie de forêt en Gironde : un homme placé en garde à vue",
  // Frankrijk-redding op de buitenland-zeef
  "Feux de forêt : la France envoie des Canadair au Portugal",
];

for (const titel of POSITIEF) {
  const oordeel = beoordeelKop(titel);
  check(oordeel.door === true, `moet worden doorgelaten (grond: ${oordeel.grond}): ${titel}`);
}

// --- 4. De drie poorten los ------------------------------------------------
check(
  gaatOverOnderwerp("Nîmes : deux voitures incendiées") === false,
  "steunterm 'incendie' zonder natuurcontext mag de onderwerppoort niet halen"
);
check(
  gaatOverOnderwerp("Un feu de broussailles près de la voie ferrée") === true,
  "steunterm mét natuurcontext moet de onderwerppoort halen"
);
check(
  faitsDiversDoorlaat("Incendie de forêt : un homme placé en garde à vue") === true,
  "een kernterm redt een kop uit de faits-divers-zeef"
);
check(
  faitsDiversDoorlaat("Bagarre générale devant un bar") === false,
  "zonder kernterm sneuvelt een faits-divers-kop"
);
check(
  buitenlandDoorlaat("Islamabad : incendie dans un hôpital") === false,
  "hoofdstad buiten Frankrijk moet de buitenland-zeef activeren"
);
check(
  buitenlandDoorlaat("La France envoie des renforts au Portugal") === true,
  "Frankrijk in de kop redt een buitenlandbericht"
);
check(
  buitenlandDoorlaat("Incendie en Gironde") === true,
  "een kop zonder buitenlandterm gaat gewoon door de buitenland-zeef"
);

// --- 5. Anders dan nlfr-menu: 'incendie' wint hier NIET ---------------------
// In nlfr-menu staat "incendie" in FAITS_DIVERS_IN en wint die term altijd.
// Hier moet precies dat NIET gebeuren, anders komt de vervuiling terug.
check(
  kopDoorlaat("Une voiture incendiée après une rixe") === false,
  "'incendie' mag een faits-divers-kop niet redden (verschil met nlfr-menu)"
);

// --- 6. Randgevallen -------------------------------------------------------
check(kopDoorlaat("") === false, "lege kop moet worden geweigerd");
check(kopDoorlaat("   ") === false, "witruimte-kop moet worden geweigerd");
check(
  kopDoorlaat("Une machine agricole prend feu dans un champ de blé") === true,
  "'machine' mag geen China-treffer geven; brand in een graanveld is wél onderwerp"
);

// --- 7. Plaatsnamen die op landschap lijken --------------------------------
// Deze koppen kwamen er wél doorheen zolang "landes", "bois" en kaal "champ" in
// de NATUUR-lijst stonden: het departement Landes, Bois-Colombes en de
// Champs-Élysées maakten van een gewone stadsbrand een natuurbrand.
const PLAATSNAAMVAL: string[] = [
  "Mont-de-Marsan (Landes) : un entrepôt en feu, pas de blessé",
  "Landes : une voiture prend feu sur l'A63",
  "Dax (Landes) : incendie dans un immeuble du centre-ville",
  "Bois-Colombes : un appartement ravagé par les flammes",
  "Var : un hangar agricole en feu près des champs",
];
for (const titel of PLAATSNAAMVAL) {
  const oordeel = beoordeelKop(titel);
  check(oordeel.door === false, `plaatsnaam mag geen natuurcontext maken: ${titel}`);
  check(
    oordeel.grond === "geen-onderwerp",
    `grond moet 'geen-onderwerp' zijn, was '${oordeel.grond}': ${titel}`
  );
}

console.log(`✓ alle ${geslaagd} onderwerpzeef-tests geslaagd`);
