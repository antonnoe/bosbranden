// Moduleregister voor de tegelstart (/start). Puur additief: bepaalt welke
// tegels worden getoond en waar ze naartoe wijzen. Drie tegels wijzen naar de
// bestaande brandpagina met een voorgeselecteerde kaartlaag (?laag=).

export interface Module {
  id: string; // "brandgevaar"
  titel: string; // "Brandgevaar"
  functie: string; // één regel gewone taal: wat de module doet
  pad: string; // waar de tegel naartoe gaat
  actief: boolean;
}

export const MODULES: Module[] = [
  {
    id: "brandgevaar",
    titel: "Brandgevaar",
    functie:
      "De verwachting of er morgen en overmorgen makkelijk nieuwe branden kunnen ontstaan — het officiële gevaarniveau per departement, nog geen brand.",
    pad: "/?laag=natuurbranden",
    actief: true,
  },
  {
    id: "rook",
    titel: "Rookverplaatsing",
    functie:
      "De berekende windbaan vanaf gedetecteerde hittebronnen: waar de lucht — en dus mogelijk de rook — naartoe waait, op leefniveau en op hoogte.",
    pad: "/rook",
    actief: true,
  },
  {
    id: "hittebronnen",
    titel: "Hittebronnen",
    functie:
      "Satellietdetecties van warmte die er nú is: gemeten hittebronnen van de afgelopen 24 uur. Een detectie is een waarneming, niet automatisch een bevestigde brand.",
    pad: "/?laag=alle",
    actief: true,
  },
  {
    id: "waarschuwingen",
    titel: "Officiële meldingen",
    functie:
      "Officiële FR-Alert-natuurbrandmeldingen van de Franse autoriteiten, geografisch geplaatst op de kaart.",
    pad: "/?laag=officieel",
    actief: true,
  },
];

export const ACTIEVE_MODULES = MODULES.filter((m) => m.actief);
