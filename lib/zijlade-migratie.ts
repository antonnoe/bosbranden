// Migratie van de bewaarde zijlade-stand (sessionStorage-sleutel
// "bosbranden-zijkolom"). De rail kende zes tabbladen; drie panelen
// (Duiding, Verantwoording, Infographics) zijn samengevoegd tot één lade achter
// de tab "Verantwoording", met interne tabs (Bronnen, Duiding, Infographics).
// Oude bewaarde waarden moeten daarom naar "uitleg" worden gemapt, zodat een
// teruggekeerde bezoeker geen kapotte of lege stand krijgt.

// De twee paneelsoorten die de rail nu nog kent.
export type PaneelSoort = "nieuws" | "uitleg";

// Interne tabkeuze binnen de Verantwoording-lade (Bronnen staat standaard aan).
export type UitlegTab = "bronnen" | "duiding" | "infographics";

// Vertaal een ruwe, mogelijk verouderde sessionStorage-waarde naar de huidige
// paneelsoort. Alles wat geen geldig paneel (meer) is — de "dicht"-schildwacht,
// een lege of onbekende waarde, of null — geeft null: de lade blijft dan dicht.
export function migreerPaneelSleutel(ruw: string | null | undefined): PaneelSoort | null {
  switch (ruw) {
    case "nieuws":
      return "nieuws";
    case "uitleg":
    // De interne tabs én de oude losse panelen leven nu binnen de lade "uitleg".
    case "bronnen":
    case "duiding":
    case "verantwoording":
    case "infographics":
      return "uitleg";
    default:
      return null;
  }
}

// Bepaal, bij het herstellen van een oude stand, welke interne tab open moet
// staan. "duiding" en "infographics" blijven behouden; al het overige — de oude
// "verantwoording"-waarde incluis, want die tab is opgegaan in "Bronnen" — valt
// terug op de standaardtab "bronnen".
export function beginUitlegTab(ruw: string | null | undefined): UitlegTab {
  return ruw === "duiding" || ruw === "infographics" ? ruw : "bronnen";
}
