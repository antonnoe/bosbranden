// Migratie van de bewaarde zijlade-stand (sessionStorage-sleutel
// "bosbranden-zijkolom"). De rail kende zes tabbladen; drie panelen
// (Duiding, Verantwoording, Infographics) zijn samengevoegd tot één
// "uitleg"-paneel. Oude bewaarde waarden moeten daarom naar "uitleg" worden
// gemapt, zodat een teruggekeerde bezoeker geen kapotte of lege stand krijgt.

// De twee paneelsoorten die de rail nu nog kent.
export type PaneelSoort = "nieuws" | "uitleg";

// Interne tabkeuze binnen het uitleg-paneel (volgorde: duiding eerst).
export type UitlegTab = "duiding" | "verantwoording" | "infographics";

// Vertaal een ruwe, mogelijk verouderde sessionStorage-waarde naar de huidige
// paneelsoort. Alles wat geen geldig paneel (meer) is — de "dicht"-schildwacht,
// een lege of onbekende waarde, of null — geeft null: de lade blijft dan dicht.
export function migreerPaneelSleutel(ruw: string | null | undefined): PaneelSoort | null {
  switch (ruw) {
    case "nieuws":
      return "nieuws";
    case "uitleg":
    // De drie oude losse panelen leven nu binnen "uitleg".
    case "duiding":
    case "verantwoording":
    case "infographics":
      return "uitleg";
    default:
      return null;
  }
}

// Bepaal, bij het herstellen van een oude stand, welke interne uitleg-tab open
// moet staan. Een oude "verantwoording"/"infographics"-waarde opent meteen die
// tab binnen het uitleg-paneel; al het overige valt terug op "duiding".
export function beginUitlegTab(ruw: string | null | undefined): UitlegTab {
  return ruw === "verantwoording" || ruw === "infographics" ? ruw : "duiding";
}
