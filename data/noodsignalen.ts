// Noodsignalen — acute situaties die VÓÓR het model om moeten (requirement 3).
// Detecteert de server een van deze signalen in de gebruikersvraag, dan komt er
// een vast, hardgecodeerd antwoord met 112/FR-Alert/prefectuur — zonder enige
// modelaanroep. Nederlands én Frans, want vakantiegangers typen soms Frans.
//
// De termen zijn bewust op de woordstam en accent-ongevoelig te matchen (zie
// bevatNoodsignaal); liever één keer te vaak het noodantwoord dan één keer te
// weinig.

export const NOODSIGNAALWOORDEN: string[] = [
  // --- Nederlands ---
  "vlammen",
  "vlam zie",
  "ik zie vuur",
  "zie vuur",
  "brand bij mijn huis",
  "brand bij huis",
  "brand naast",
  "brand vlakbij",
  "brand dichtbij",
  "het brandt",
  "staat in brand",
  "huis in brand",
  "rook in huis",
  "rook binnen",
  "rook in mijn huis",
  "moet ik evacueren",
  "moeten we evacueren",
  "evacueren",
  "evacuatie nu",
  "we worden geevacueerd",
  "ingesloten door",
  "kom niet weg",
  "kunnen niet weg",
  "vuur nadert",
  "vuur komt",
  "ik ben in gevaar",
  "levensgevaar",
  "help ons",
  // --- Frans ---
  "flammes",
  "je vois du feu",
  "au feu",
  "le feu est",
  "feu pres de",
  "feu proche",
  "ma maison brule",
  "maison en feu",
  "fumee dans la maison",
  "fumee a l interieur",
  "dois-je evacuer",
  "on evacue",
  "evacuation",
  "encercle par le feu",
  "je suis en danger",
  "au secours",
];

// Het vaste antwoord. Geen model, geen variatie — dit is de enige inhoud die de
// server bij een noodsignaal teruggeeft.
export const NOODANTWOORD =
  "Dit klinkt als een acute noodsituatie. Neem meteen contact op met de hulpdiensten " +
  "— bel 112 (of 18 voor de brandweer; doven en slechthorenden: sms naar 114). " +
  "Volg de instructies van FR-Alert (de officiële waarschuwingsdienst) en van uw " +
  "prefectuur en mairie. Deze tool is een duiding op basis van satelliet- en " +
  "weergegevens en is geen hulpdienst; wacht bij gevaar niet op deze tool maar bel 112.";
