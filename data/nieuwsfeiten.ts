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

// ---------------------------------------------------------------------------
// "Stand van zaken" — het redactionele nieuwsblok in de zijkolom. Elke claim
// hangt aan een vaste, gecontroleerde bron; de bron is een label + URL die als
// link wordt gerenderd (zelfde link-opmaak als elders in de zijkolom).
// Zet STAND_VAN_ZAKEN op null als er niets actueels te melden is.
// ---------------------------------------------------------------------------
export interface StandBron {
  label: string; // bijv. "NOS", "franceinfo"
  url: string;
}

export interface StandRegel {
  tekst: string;
  bron: StandBron;
}

export interface StandBlok {
  kop: string;
  paragraaf?: StandRegel; // doorlopende alinea met één bron
  punten?: StandRegel[]; // opsomming, elk punt met een eigen bron
}

export interface StandVanZaken {
  titel: string;
  inleiding: StandRegel;
  blokken: StandBlok[];
}

export const STAND_VAN_ZAKEN: StandVanZaken | null = {
  titel: "Stand van zaken 27-07-2026, 11:00",
  inleiding: {
    tekst:
      'De nacht van zondag op maandag is de brand bij Bordeaux "overwegend stabiel" gebleven (prefectuur Gironde via BFM TV). Geen herhaling dus van de heftige opleving van zaterdagnacht. Maar stabiel is niet onder controle: préfète Sophie Brocas sluit terugkeer uit zolang het vuur niet gefixeerd is, en ook werken in de circa 20 geëvacueerde gemeenten was maandag uitgesloten. De brandweer houdt er rekening mee dat het vuur weken tot zelfs maanden kan duren voor het volledig geblust is.',
    bron: {
      label: "NOS",
      url: "https://nos.nl/liveblog/2624302-al-54-brandweerlieden-gewond-in-gironde-toeristen-moeten-wegblijven-uit-gironde",
    },
  },
  blokken: [
    {
      kop: "Belangrijkste cijfers",
      punten: [
        {
          tekst:
            "Schade: 240 woningen verwoest, waarvan ruim 170 in Le Porge — de zwaarst getroffen gemeente, vlak bij de brandhaard.",
          bron: {
            label: "Europe1",
            url: "https://www.europe1.fr/meteo/incendies-en-gironde-240-habitations-detruites-dont-170-sur-la-seule-commune-du-porge-988002",
          },
        },
        {
          tekst: "Areaal ~42.000 ha; 220.000 mensen geëvacueerd (totaal, ongewijzigd).",
          bron: {
            label: "VRT",
            url: "https://www.vrt.be/vrtnws/nl/liveblog/branden-rond-bordeaux-overwegend-stabiel-gebleven-~1783176592077/",
          },
        },
        {
          tekst: "Gewonden opgelopen tot 84 hulpverleners; gisteren kwamen er negen bij.",
          bron: {
            label: "VRT",
            url: "https://www.vrt.be/vrtnws/nl/liveblog/branden-rond-bordeaux-overwegend-stabiel-gebleven-~1783176592077/",
          },
        },
        {
          tekst: "Het vuur sprong in de nacht door van Saumos naar het grondgebied van Le Porge.",
          bron: {
            label: "Atmo",
            url: "https://www.atmo-nouvelleaquitaine.org/actualite/incendies-en-gironde-et-dans-les-landes-suivi-de-la-qualite-de-lair",
          },
        },
      ],
    },
    {
      kop: "Landelijke overheid",
      paragraaf: {
        tekst:
          "Macron zat maandag om 10u een interministeriële crisiscel voor, gevolgd door een ministerraad; minister Lescure bevestigde dat verzekeraars de herhuisvestingskosten van geëvacueerden dekken.",
        bron: {
          label: "franceinfo",
          url: "https://www.franceinfo.fr/faits-divers/incendies-en-gironde/direct-incendies-en-gironde-84-sapeurs-pompiers-blesses-par-l-incendie-reste-globalement-stable-au-cours-de-la-nuit_8123420.html",
        },
      },
    },
    {
      kop: "Luchtkwaliteit en reizen",
      punten: [
        {
          tekst:
            "PM10-rood: zondag zes departementen (Dordogne, Gironde, Landes, Lot-et-Garonne, Aveyron, Gard), maandag uitgebreid naar elf. Sluit aan op de rookbaan naar het oostzuidoosten.",
          bron: {
            label: "franceinfo",
            url: "https://www.franceinfo.fr/faits-divers/incendies-en-gironde/direct-incendies-en-gironde-84-sapeurs-pompiers-blesses-par-l-incendie-reste-globalement-stable-au-cours-de-la-nuit_8123420.html",
          },
        },
        {
          tekst:
            "De A63 is tussen Bordeaux en Bayonne in beide richtingen dicht; de prefect roept toeristen op niet te komen en, indien al aanwezig, te overwegen te vertrekken.",
          bron: {
            label: "ANWB",
            url: "https://www.anwb.nl/verkeer/nieuws/buitenland/2026/juli/bosbranden-frankrijk",
          },
        },
      ],
    },
  ],
};
