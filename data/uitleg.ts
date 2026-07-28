// Centrale uitlegteksten voor de [i]-knopjes op de kaart. Eén plek zodat de
// tekst hier onderhouden wordt en later hergebruikt kan worden in de rookmodule.
// Doelgroep: Nederlandstalige huiseigenaar of vakantieganger in Frankrijk,
// zonder technische voorkennis. Elke tekst legt uit wat een term betekent en
// wat de lezer eraan heeft — geen vakjargon zonder duiding.

export interface UitlegItem {
  kop: string;
  tekst: string;
}

export const UITLEG = {
  frp: {
    kop: "FRP",
    tekst:
      "Fire Radiative Power — het geschatte vermogen dat de warmtebron uitstraalt " +
      "op het moment van de satellietpassage. Het zegt iets over de sterkte van het " +
      "signaal, niet over het verbrande oppervlak.",
  },
  betrouwbaarheid: {
    kop: "Betrouwbaarheid",
    tekst:
      "NASA geeft per meting aan hoe zeker het instrument is dat er echt een " +
      "warmtebron is gemeten. Standaard is de gewone klasse; laag betekent dat het " +
      "signaal ook ruis kan zijn.",
  },
  cluster: {
    kop: "Groep metingen",
    tekst:
      "Meerdere metingen die dicht bij elkaar — binnen enkele kilometers — en kort " +
      "na elkaar zijn gedaan. Zo'n groep past bij een brand die enige tijd " +
      "doorbrandt, maar kan ook van een vaste warmtebron komen, zoals een fabriek of " +
      "gasfakkel. Een losse meting hoort niet bij zo'n groep.",
  },
  viirs: {
    kop: "VIIRS",
    tekst:
      "VIIRS is een infraroodsensor op weersatellieten. Hij meet warmte, geen " +
      "vlammen: elke meting markeert een beeldpixel van ongeveer 375 × 375 meter " +
      "waarin het warmer is dan de omgeving. Dat kan een natuurbrand zijn, maar ook " +
      "landbouwvuur, industrie of hete rook.",
  },
  verwachtBrandgevaar: {
    kop: "Verwacht brandgevaar",
    tekst:
      "De kleur van elk departement is de verwachting van Météo-France voor morgen " +
      "of overmorgen: hoe gunstig het weer is voor het ontstaan en uitbreiden van " +
      "brand. Het is een voorspelling van gevaar, geen melding van een bestaande " +
      "brand.",
  },
} as const satisfies Record<string, UitlegItem>;

export type UitlegSleutel = keyof typeof UITLEG;
