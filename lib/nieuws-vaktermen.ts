// Franse administratieve en technische vaktermen die de samenvatdienst geregeld
// mis vertaalt (C). Twee sporen, allebei puur en los te testen:
//
//  1. bouwContextTitel(): stopt een compacte woordenlijst in het context_title —
//     een veld dat de dienst aantoonbaar aanneemt (het staat in het contract
//     french_url / context_url / context_title). Zo krijgt de vertaler de juiste
//     betekenis al aan de bron mee. (De dienst is vanuit onze omgeving door de
//     egress-proxy geblokkeerd, dus of hij een ÉXTRA veld aanneemt is hier niet
//     te testen; context_title is de veilige, gedocumenteerde drager.)
//  2. corrigeerVaktermen(): een naverwerking als vangnet — mocht de woordenlijst
//     aan de bron niet doorwerken, dan worden de bekende foute Nederlandse
//     renderingen alsnog rechtgezet, mét de Franse term erbij (juist dáárop
//     onderscheidt de tool zich).

export interface Vakterm {
  fr: string;
  nl: string; // korte, juiste Nederlandse duiding (voor de woordenlijst)
}

// Woordenlijst voor de dienst. De eerste drie zijn de aangetroffen fouten; de
// rest zijn veelvoorkomende termen uit dezelfde hoek (C1-lijst).
export const GLOSSARIUM: Vakterm[] = [
  { fr: "débroussaillement", nl: "struikgewas en ondergroei weghalen (wettelijke verplichting, geen onkruid wieden)" },
  { fr: "chômage partiel", nl: "gedeeltelijke werkloosheid: werknemer blijft in dienst, de staat vergoedt niet-gewerkte uren (géén werkloosheidsuitkering)" },
  { fr: "massif (forestier)", nl: "bosmassief (aaneengesloten bosgebied), niet 'massief bos'" },
  { fr: "arrêté", nl: "(prefectoraal) besluit of verordening" },
  { fr: "préfecture", nl: "prefectuur" },
  { fr: "commune", nl: "gemeente" },
  { fr: "sinistré", nl: "getroffene / getroffen gebied" },
  { fr: "mairie", nl: "gemeentehuis / gemeentebestuur" },
  { fr: "pompiers", nl: "brandweer" },
  { fr: "canicule", nl: "hittegolf" },
  { fr: "vigilance", nl: "waakzaamheidsniveau (weerwaarschuwing)" },
];

// Bouwt het context_title: de sitenaam plus de woordenlijst als instructie.
export function bouwContextTitel(basis: string): string {
  const lijst = GLOSSARIUM.map((t) => `${t.fr} = ${t.nl}`).join("; ");
  return `${basis}. Vertaal deze Franse vaktermen correct in het Nederlands: ${lijst}.`;
}

// Naverwerking: zet bekende foute renderingen recht. Conservatief en idempotent —
// de vervangingen bevatten de Franse term, dus een tweede pass matcht niets meer,
// en een reeds correcte tekst van de dienst blijft ongemoeid (de foute patronen
// komen daarin niet voor).
const VERVANGINGEN: Array<{ patroon: RegExp; naar: string }> = [
  // débroussaillement
  {
    patroon: /\bonkruidverwijdering\b/gi,
    naar: "het weghalen van struikgewas en ondergroei (débroussaillement)",
  },
  {
    patroon: /\bonkruidbestrijding\b/gi,
    naar: "het weghalen van struikgewas en ondergroei (débroussaillement)",
  },
  // chômage partiel
  {
    patroon: /\bwerkloosheidsuitkeringen\b/gi,
    naar: "gedeeltelijke werkloosheid (chômage partiel)",
  },
  {
    patroon: /\bwerkloosheidsuitkering\b/gi,
    naar: "gedeeltelijke werkloosheid (chômage partiel)",
  },
  // massif forestier
  { patroon: /\bmassieve bossen\b/gi, naar: "bosmassieven" },
  { patroon: /\bmassieve bos\b/gi, naar: "bosmassief" },
  { patroon: /\bmassief bos\b/gi, naar: "bosmassief" },
  { patroon: /\bmassieve bosgebieden\b/gi, naar: "bosmassieven" },
];

export function corrigeerVaktermen(tekst: string): string {
  if (!tekst) return tekst;
  let uit = tekst;
  for (const { patroon, naar } of VERVANGINGEN) {
    uit = uit.replace(patroon, naar);
  }
  return uit;
}
