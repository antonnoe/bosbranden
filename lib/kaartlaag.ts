// Gedeelde kaartlaag-sleutel voor de zichtbare laagkeuze boven de SVG-kaart
// (/). De laagkeuze gebruikt exact de woorden van /start en stuurt de bestaande
// ?laag=-deeplink aan, zodat een gedeelde link deelbaar en herkenbaar blijft.

// De drie lagen die de laagkeuze toont. Ze mappen op de bestaande
// kaartintenties in Tool.tsx (weergave + wel/geen satellietwaarnemingen):
//   gevaar    → departementkleuren, geen satellietpins
//   alle      → warmtebronnen mét satellietpins (gemeten hittebronnen)
//   officieel → FR-Alert-meldingen
export type KaartLaag = "gevaar" | "alle" | "officieel";

// De labels van de knoppen — exact dezelfde woorden als op /start.
export const LAAG_LABELS: Record<KaartLaag, string> = {
  gevaar: "Gevaar morgen",
  alle: "Hittebronnen 24 u",
  officieel: "Officiële meldingen",
};

// Eén regel die de gekozen laag benoemt in dezelfde taal als /start. Dezelfde
// formulering loopt zo mee van tegel naar kaart, inclusief de eerlijkheid
// ("een detectie is geen bevestigde brand", "een lege lijst betekent niet…").
export const LAAG_UITLEG: Record<KaartLaag, string> = {
  gevaar:
    "Verwacht gevaarniveau per departement, morgen en overmorgen — dit gaat over de kans dat er iets ontstaat, er brandt nu niets.",
  alle: "Gemeten warmte, afgelopen 24 uur, per pixel — een detectie is geen bevestigde brand.",
  officieel:
    "Officiële FR-Alert-meldingen, hele land, met vertraging — een lege lijst betekent niet dat er niets speelt.",
};

// Normaliseer een ruwe ?laag=-waarde naar een van de drie lagen. Oude
// deeplinkwaarden (hittebronnen/warmte/geclusterd) landen op "alle"; een
// onbekende of ontbrekende waarde valt terug op de standaardlaag "alle"
// (warmtebronnen mét satellietpins — de bestaande standaardweergave).
export function normaliseerLaag(ruw: string | null | undefined): KaartLaag {
  switch (ruw) {
    case "gevaar":
      return "gevaar";
    case "officieel":
      return "officieel";
    case "alle":
    case "hittebronnen":
    case "warmte":
    case "geclusterd":
      return "alle";
    default:
      return "alle";
  }
}
