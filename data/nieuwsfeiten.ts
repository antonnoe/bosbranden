// Handmatige nieuwsfeiten voor de zijkolom op /start.
// ---------------------------------------------------------------------------
// Zo voeg je een feit toe (via github.com, geen gereedschap nodig):
//   1. Zet het NIEUWSTE item BOVENAAN, direct onder de regel "export const …[".
//   2. Kopieer de voorbeeldregel hieronder, plak hem bovenaan de lijst en pas
//      hem aan. Let op de komma aan het eind.
//   3. tijd = ISO-tijd, bijv. "2026-07-26T14:30:00Z" (Z = UTC).
//      tekst = één korte zin. bron/url zijn optioneel. zwaar: true geeft een
//      accentstreep links (gebruik spaarzaam, alleen voor zwaarwegend nieuws).
//
// Voorbeeldregel (NIET actief; staat in commentaar):
//   { tijd: "2026-07-26T14:30:00Z", tekst: "Prefectuur sluit het massief van de Landes.", bron: "prefectuur Gironde", url: "https://…", zwaar: true },
//
// Laat de lijst leeg als er niets te melden is. Verzin geen nieuws.

export interface Nieuwsfeit {
  tijd: string; // ISO
  tekst: string; // één korte zin
  bron?: string; // "ANP", "prefectuur Gironde"
  url?: string;
  zwaar?: boolean; // true = accentstreep
}

export const NIEUWSFEITEN: Nieuwsfeit[] = [
];
