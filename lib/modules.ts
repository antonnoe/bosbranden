// Moduleregister voor de tegelstart (/start). De start is een beslisscherm:
// drie blokken, gegroepeerd op tijd (nu-gemeten / straks-verwacht / officieel)
// in plaats van op onderwerp. Elk blok toont zijn herkomst expliciet, zodat een
// meting (hittebronnen) niet met een verwachting (brandgevaar) wordt verward.

export type Tijdgroep = "nu" | "straks" | "officieel";

export interface Module {
  id: string; // "hittebronnen"
  titel: string; // "Hittebronnen"
  groep: Tijdgroep; // tijdkop waaronder het blok valt
  // Herkomstregel: drie delen met " · " (bron · korrel · tijdvenster).
  herkomst: string;
  pad: string; // waar de primaire kaartactie naartoe wijst (?laag=)
}

// Tijdkoppen boven elke groep, in vaste volgorde nu → straks → officieel.
export const GROEP_KOPPEN: Record<Tijdgroep, string> = {
  nu: "Nu — gemeten",
  straks: "Straks — verwacht",
  officieel: "Officieel",
};

// Vaste volgorde: Hittebronnen (nu) → Brandgevaar (straks) → FR-Alert (officieel).
// De volgorde is bewust vast en hangt NIET van de ernst af; ernst blijft
// zichtbaar via de border-left-kleur, het ernst-merk en de statusregel — nooit
// via de positie.
export const MODULES: Module[] = [
  {
    id: "hittebronnen",
    titel: "Hittebronnen",
    groep: "nu",
    herkomst: "Satelliet VIIRS · per pixel · afgelopen 24 uur",
    pad: "/?laag=alle",
  },
  {
    id: "brandgevaar",
    titel: "Brandgevaar",
    groep: "straks",
    herkomst: "Météo-France · per departement · morgen & overmorgen",
    pad: "/?laag=gevaar",
  },
  {
    id: "waarschuwingen",
    titel: "FR-Alert",
    groep: "officieel",
    herkomst: "Autoriteiten · hele land · met vertraging",
    pad: "/?laag=officieel",
  },
];

// Rookpaden is geen eigen tegel meer, maar een vervolgactie binnen het
// hittebronnenblok: pas als er warmte gemeten is, is "waar waait de rook
// heen?" een zinnige volgende vraag.
export const ROOK_ACTIE = {
  label: "Waar waait de rook heen? →",
  pad: "/rook",
} as const;
