// Redactioneel nieuwsblok voor de zijkolom op /start.
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

// Een praktische verwijzing is uitdrukkelijk géén feitclaim: het is een losse
// nuttige link zonder cijfer of bewering. Bewust een aparte soort regel, zodat
// claims en praktische links in het datamodel gescheiden blijven (en de link
// niet als bron wordt meegeteld).
export interface PraktischeLink {
  tekst: string;
  url: string;
}

export interface StandBlok {
  kop: string;
  paragraaf?: StandRegel; // doorlopende alinea met één bron
  punten?: StandRegel[]; // opsomming, elk punt met een eigen bron
  praktischeLinks?: PraktischeLink[]; // losse verwijzingen, geen feitclaim
}

export interface StandVanZaken {
  titel: string;
  inleiding: StandRegel;
  blokken: StandBlok[];
}

// Op null gezet op 27-07-2026 om 23:45: het blok van 11:00 was achterhaald door
// de automatische nieuwsstroom eronder (in de Landes was het vuur inmiddels
// gefixeerd en mochten bewoners terug). De automatische stroom is nu het nieuws.
// Wil je weer een geverifieerd overzicht bovenaan: haal het object hieronder uit
// commentaar en zet het achter het isgelijkteken in plaats van null.
export const STAND_VAN_ZAKEN: StandVanZaken | null = null;

/* Bewaard voor hergebruik — het blok van 27-07-2026 11:00:
{
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
      ],
    },
    {
      kop: "Landelijke overheid",
      punten: [
        {
          tekst:
            "Macron zat maandag om 10u een interministeriële crisiscel voor op het ministerie van Binnenlandse Zaken; de twee eerdere bijeenkomsten stonden onder leiding van premier Lecornu. Daarna volgden overleggen over de economische gevolgen van de branden.",
          bron: {
            label: "Euronews",
            url: "https://fr.euronews.com/my-europe/2026/07/27/lincendie-pres-de-bordeaux-globalement-stable-durant-la-nuit",
          },
        },
        {
          tekst:
            "Verzekeraars nemen de herhuisvestingskosten van geëvacueerden op zich. De regeling is met France Assureurs onderhandeld, geldt voor hoofdverblijven, loopt tot maximaal drie weken afhankelijk van hoe lang de toegang tot de woning verboden blijft, geldt of de woning beschadigd is of niet, en er worden bewijsstukken gevraagd.",
          bron: {
            label: "AFP",
            url: "https://www.boursorama.com/actualite-economique/actualites/les-assureurs-prennent-des-mesures-exceptionnelles-pour-les-victimes-des-incendies-1433cfc7e4ac564acf6f33b26c1f0eec",
          },
        },
      ],
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
            label: "NOS",
            url: "https://nos.nl/liveblog/2624302-al-54-brandweerlieden-gewond-in-gironde-toeristen-moeten-wegblijven-uit-gironde",
          },
        },
      ],
      praktischeLinks: [
        {
          tekst: "Actuele wegafsluitingen Frankrijk, Spanje en Portugal — ANWB",
          url: "https://www.anwb.nl/verkeer/nieuws/buitenland/2026/juli/bosbranden-frankrijk",
        },
      ],
    },
  ],
};
*/
