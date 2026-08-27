// De schaalverdeling voor FRP (Fire Radiative Power, in megawatt) — de enige
// plek waar die grenzen staan.
//
// WAAROM DIT EEN APART BESTAND IS. De grenzen stonden als losse getallen in
// grootteordeFrp() in lib/assistent-context.ts, waar de duider ze gebruikte. De
// rookkaart kreeg daarna een eigen markering "waarschijnlijke natuurbrand" met
// een eigen drempel, en die twee raakten uit de pas: een bron van 7,1 MW kreeg
// de markering, terwijl de duider er direct onder schreef dat 7,1 MW "klein,
// vergelijkbaar met een brandende schuur" is. Twee onderdelen van dezelfde
// popup spraken elkaar tegen over precies het onderscheid dat ze moesten maken.
//
// Door de schaal hier te centreren kan dat niet meer: markering én tekst lezen
// dezelfde grens. Dit bestand is bewust vrij van imports en van het "@/"-alias,
// zodat het ook buiten Next te laden is (zie scripts/test-rookbeoordeling.ts).

// Bovengrens van de kleinste band. Onder deze waarde noemt de tool een
// warmtebron expliciet schuur-formaat; daar hoort dus géén brandmarkering bij.
export const FRP_KLEIN_MAX_MW = 10;

// Vaste schaalvergelijking voor een FRP-waarde. De grenzen liggen in code vast,
// niet bij het model; de uitkomst gaat als voorgekauwde regel mee zodat het
// model zelf nooit een categorie hoeft te bedenken (35 MW is klein — geen
// "middelgrote bosbrand"). Grenzen: <10 / 10–100 / 100–500 / >500 MW.
export function grootteordeFrp(frp: number): string {
  if (frp < FRP_KLEIN_MAX_MW) {
    return "klein, vergelijkbaar met een brandende schuur of een klein perceel";
  }
  if (frp < 100) return "beperkt van omvang";
  if (frp <= 500) return "aanzienlijk";
  return "zeer groot";
}

// Valt deze bron in de kleinste band — het formaat dat de tool zelf "een
// brandende schuur of een klein perceel" noemt?
//
// Een onbekende FRP telt hier NIET als klein: afwezige data is geen meting, en
// de beller beslist zelf wat hij met "niet vast te stellen" doet.
export function isSchuurFormaat(frp: number | null | undefined): boolean {
  return typeof frp === "number" && Number.isFinite(frp) && frp < FRP_KLEIN_MAX_MW;
}
