// Bronnenbestand voor het automatische nieuws in de zijlade.
// ---------------------------------------------------------------------------
// DIT BESTAND IS DE ENIGE TOEGESTANE BRONNENLIJST. De nieuws-route haalt
// uitsluitend de feeds hieronder op. Een item waarvan de host (registreerbaar
// domein) niet bij één van deze bronnen hoort, wordt weggegooid — zo komt er
// nooit materiaal van een aggregator of een vreemd domein binnen.
//
// Zo voeg je een bron toe (via github.com, geen gereedschap nodig):
//   1. Kopieer een bestaande regel, plak hem in de juiste groep en pas hem aan.
//   2. `soort` bepaalt de groep in de weergave: 'officieel' (boven) of 'pers'.
//   3. `paywall: true` toont bij persitems het rustige label
//      "abonnement mogelijk vereist". Officiële bronnen zijn per definitie vrij
//      toegankelijk en krijgen nooit een label.
//   4. `bevestigd` = of de FEED-URL is geverifieerd als een werkende feed.
//        - Persbronnen: door Anton aangeleverde uitgaven; de feed-URL is de
//          gangbare sectie-feed, maar niet vanuit deze omgeving getest.
//        - Officiële bronnen: kandidaten met een VERMOEDELIJKE feed-URL die nog
//          ontdekt/bevestigd moet worden → `bevestigd: false`.
//      De echte, actuele status per bron toont de sectie "Bronnen" onderaan het
//      nieuws (die leest live af of de laatste ophaalpoging slaagde). Dit veld
//      is alleen een notitie over de herkomst van de URL.
//
// Verzin geen bronnen. Alleen echte, controleerbare feeds horen hier thuis.

export type BronSoort = "officieel" | "pers";

export interface Nieuwsbron {
  naam: string;
  url: string; // feed-URL (RSS of Atom)
  soort: BronSoort;
  paywall: boolean;
  regio: string;
  bevestigd: boolean; // is de feed-URL geverifieerd? (zie toelichting hierboven)
}

export const NIEUWSBRONNEN: Nieuwsbron[] = [
  // ---- OFFICIEEL (staat boven in de weergave) --------------------------------
  // Kandidaten met vermoedelijke feed-URL; nog niet bevestigd (zie punt 5).
  {
    naam: "Préfecture de la Gironde — communiqués de presse",
    url: "https://www.gironde.gouv.fr/contenu/rss/toutes-les-actualites",
    soort: "officieel",
    paywall: false,
    regio: "Gironde",
    bevestigd: false,
  },
  {
    naam: "Atmo Nouvelle-Aquitaine — actualités",
    url: "https://www.atmo-nouvelleaquitaine.org/rss.xml",
    soort: "officieel",
    paywall: false,
    regio: "Nouvelle-Aquitaine",
    bevestigd: false,
  },
  // France 3 en ici.fr (France Bleu) zijn publieke omroepen: journalistiek, geen
  // autoriteit. Daarom soort 'pers', niet 'officieel'. Alleen préfecture en Atmo
  // blijven officieel.
  {
    naam: "France 3 Nouvelle-Aquitaine",
    url: "https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/rss.xml",
    soort: "pers",
    paywall: false,
    regio: "Nouvelle-Aquitaine",
    bevestigd: false,
  },
  {
    naam: "ici.fr — landelijk",
    url: "https://www.ici.fr/rss",
    soort: "pers",
    paywall: false,
    regio: "landelijk",
    bevestigd: false,
  },
  {
    naam: "ici.fr — Gironde",
    url: "https://www.ici.fr/gironde/rss",
    soort: "pers",
    paywall: false,
    regio: "Gironde",
    bevestigd: false,
  },
  {
    naam: "ici.fr — Gascogne",
    url: "https://www.ici.fr/gascogne/rss",
    soort: "pers",
    paywall: false,
    regio: "Gascogne",
    bevestigd: false,
  },
  {
    naam: "ici.fr — Pays basque",
    url: "https://www.ici.fr/pays-basque/rss",
    soort: "pers",
    paywall: false,
    regio: "Pays basque",
    bevestigd: false,
  },

  // ---- PERS (staat onder in de weergave) -------------------------------------
  // Door Anton aangeleverd; feed-URL is de gangbare sectie-feed, niet getest.
  {
    naam: "Sud Ouest — faits divers",
    url: "https://www.sudouest.fr/faits-divers/rss.xml",
    soort: "pers",
    paywall: true,
    regio: "Gironde/Landes",
    bevestigd: true, // levert in productie aantoonbaar items
  },
  {
    naam: "Midi Libre — faits divers",
    url: "https://www.midilibre.fr/faits-divers/rss.xml",
    soort: "pers",
    paywall: true,
    regio: "Occitanie",
    bevestigd: true, // levert in productie aantoonbaar items
  },
  {
    naam: "Le Parisien — Seine-et-Marne",
    url: "https://feeds.leparisien.fr/leparisien/seine-et-marne",
    soort: "pers",
    paywall: true,
    regio: "Île-de-France",
    bevestigd: false,
  },
  {
    naam: "Corse-Matin",
    url: "https://www.corsematin.com/rss",
    soort: "pers",
    paywall: true,
    regio: "Corsica",
    bevestigd: false,
  },
  {
    naam: "France 3 Paris Île-de-France",
    url: "https://france3-regions.francetvinfo.fr/paris-ile-de-france/rss.xml",
    soort: "pers",
    paywall: false,
    regio: "Île-de-France",
    bevestigd: false,
  },
  {
    naam: "France 3 Provence-Alpes-Côte d'Azur",
    url: "https://france3-regions.francetvinfo.fr/provence-alpes-cote-d-azur/rss.xml",
    soort: "pers",
    paywall: false,
    regio: "PACA",
    bevestigd: false,
  },
];
