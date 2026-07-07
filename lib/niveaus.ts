// De vier officiële niveaus van de Météo des forêts (Météo-France).
// Kleuren zijn de officiële Météo-France-risicokleuren en mogen niet
// vervangen worden door huisstijlkleuren.

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
    kleur: "#31aa35",
    tekstKleur: "#ffffff",
    toelichting:
      "Het weer zorgt voor een laag risico op het ontstaan en de verspreiding van bosbrand. Blijf altijd voorzichtig met vuur in de natuur.",
  },
  2: {
    waarde: 2,
    fr: "modéré",
    nl: "gemiddeld",
    kleur: "#f6e50e",
    tekstKleur: "#3d3200",
    toelichting:
      "Verhoogde waakzaamheid: onder deze weersomstandigheden kan een brand gemakkelijker ontstaan. Vermijd vuur, barbecue en werkzaamheden met vonkvorming in en bij de natuur.",
  },
  3: {
    waarde: 3,
    fr: "élevé",
    nl: "hoog",
    kleur: "#ff9e00",
    tekstKleur: "#4a2b00",
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
