// De vier officiële niveaus van de Météo des forêts (Météo-France).
// Kleur heeft hier één rol — gevaarniveau — en is dus NOOIT de huisstijlkleur
// (bordeaux). De schaal loopt op van groen (laag) naar rood (zeer hoog); de
// tinten zijn afgestemd op leesbaarheid tegen een lichte ondergrond (lichtgeel
// verdween en is amber geworden; fel groen/oranje zijn iets verdiept). De
// waarden komen overeen met de tokens --niveau-1 t/m --niveau-4 in globals.css.

export interface Niveau {
  waarde: 1 | 2 | 3 | 4;
  fr: string;
  nl: string;
  kleur: string;
  tekstKleur: string; // leesbare tekstkleur óp het kleurblok
  toelichting: string;
}

export const NIVEAUS: Record<number, Niveau> = {
  1: {
    waarde: 1,
    fr: "faible",
    nl: "laag",
    kleur: "#2f6b3a",
    tekstKleur: "#ffffff",
    toelichting:
      "Het weer zorgt voor een laag risico op het ontstaan en de verspreiding van bosbrand. Blijf altijd voorzichtig met vuur in de natuur.",
  },
  2: {
    waarde: 2,
    fr: "modéré",
    nl: "gemiddeld",
    kleur: "#d4a017",
    tekstKleur: "#2b2220",
    toelichting:
      "Verhoogde waakzaamheid: onder deze weersomstandigheden kan een brand gemakkelijker ontstaan. Vermijd vuur, barbecue en werkzaamheden met vonkvorming in en bij de natuur.",
  },
  3: {
    waarde: 3,
    fr: "élevé",
    nl: "hoog",
    kleur: "#c2560f",
    tekstKleur: "#ffffff",
    toelichting:
      "Hoog gevaarniveau: een brand kan snel ontstaan en zich snel uitbreiden. Geen open vuur, niet roken in de natuur en let op lokale toegangsbeperkingen van bossen en natuurgebieden.",
  },
  4: {
    waarde: 4,
    fr: "très élevé",
    nl: "zeer hoog",
    kleur: "#e8202a",
    tekstKleur: "#ffffff",
    toelichting:
      "Zeer hoog gevaarniveau: extreme voorzichtigheid geboden. Bossen en natuurgebieden kunnen gesloten zijn. Volg de instructies van prefectuur en mairie strikt op.",
  },
};

export const GEEN_DATA_KLEUR = "#d9d9d9";

export function niveauVoor(waarde: number | null | undefined): Niveau | null {
  if (waarde == null) return null;
  return NIVEAUS[waarde] ?? null;
}
