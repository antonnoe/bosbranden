// Bronnenbestand voor het automatische nieuws in de zijlade.
// ---------------------------------------------------------------------------
// DIT BESTAND IS DE ENIGE TOEGESTANE BRONNENLIJST. De nieuws-route haalt
// uitsluitend de feeds hieronder op die op `actief: true` staan. Een item
// waarvan de host (registreerbaar domein) niet bij één van die bronnen hoort,
// wordt weggegooid — zo komt er nooit materiaal van een aggregator of een
// vreemd domein binnen.
//
// Zo voeg je een bron toe (via github.com, geen gereedschap nodig):
//   1. Kopieer een bestaande regel, plak hem in de juiste groep en pas hem aan.
//   2. `soort` bepaalt de groep in de weergave: 'officieel' (boven) of 'pers'.
//   3. `paywall: true` toont bij persitems het rustige label
//      "abonnement mogelijk vereist". Officiële bronnen zijn per definitie vrij
//      toegankelijk en krijgen nooit een label.
//   4. `bevestigd` = of de FEED-URL is geverifieerd als een werkende feed. Zet
//      dit NOOIT op goed vertrouwen — alleen als de feedcontrole het adres heeft
//      zien werken (GitHub → Actions → "Feedcontrole", of
//      `node scripts/probeer-feeds.mjs`).
//   5. `actief` = of de route deze bron ophaalt. Een bron waarvan de feed is
//      verdwenen zetten we op `false` in plaats van hem te verwijderen: de
//      regel blijft staan met de reden erbij, zodat we later niet opnieuw gaan
//      uitzoeken wat we al weten, en weer aanzetten één woord is.
//      De echte, actuele status per bron toont de sectie "Bronnen" onderaan het
//      nieuws (die leest live af wat de laatste ophaalpoging deed).
//
// Verzin geen bronnen. Alleen echte, controleerbare feeds horen hier thuis.
//
// STAND VAN 26-08-2026, vastgesteld met de feedcontrole (zie README, "Kapotte
// feed-URL opsporen"). Van de dertien bronnen werkten er nog twee. Drie
// France 3-feeds bleken alleen verhuisd van /rss.xml naar /rss en zijn hersteld;
// zeven bronnen leverden op geen enkel getest adres nog een feed en staan nu op
// `actief: false`, elk met de reden op de regel zelf.

export type BronSoort = "officieel" | "pers";

export interface Nieuwsbron {
  naam: string;
  url: string; // feed-URL (RSS of Atom)
  soort: BronSoort;
  paywall: boolean;
  regio: string;
  bevestigd: boolean; // is de feed-URL geverifieerd? (zie punt 4 hierboven)
  actief: boolean; // haalt de route deze bron op? (zie punt 5 hierboven)
}

export const NIEUWSBRONNEN: Nieuwsbron[] = [
  // ---- OFFICIEEL (staat boven in de weergave) --------------------------------
  {
    naam: "Préfecture de la Gironde — communiqués de presse",
    url: "https://www.gironde.gouv.fr/contenu/rss/toutes-les-actualites",
    soort: "officieel",
    paywall: false,
    regio: "Gironde",
    bevestigd: false,
    actief: false,
    // 26-08-2026: HTTP 404. De site is wél gelezen en kondigt geen enkele feed
    // aan in zijn HTML; zestien beproefde adressen leverden niets op. Dit is de
    // waardevolste bron voor deze tool (arrêtés, toegangsverboden, gesloten
    // jacht) — als er ooit weer een feed opduikt, is dit de eerste om aan te
    // zetten. Officiële waarschuwingen lopen intussen via /api/fr-alert.
  },
  {
    naam: "Atmo Nouvelle-Aquitaine — actualités",
    url: "https://www.atmo-nouvelleaquitaine.org/rss.xml",
    soort: "officieel",
    paywall: false,
    regio: "Nouvelle-Aquitaine",
    bevestigd: true,
    actief: true,
    // 26-08-2026: het adres geeft een geldige RSS 2.0 terug, maar op dit moment
    // zonder enkel item. Dat is een wérkende feed die leeg staat, geen kapot
    // adres — vandaar bevestigd: true en gewoon actief. Luchtkwaliteit valt
    // recht in de scope van de zeef (rook, fijnstof, indice Atmo), dus zodra
    // Atmo publiceert komt het binnen. In de bronstatus verschijnt hij zolang
    // als "geen feed op dit adres" of "niets binnen 7 dagen"; dat klopt.
  },
  // France 3 en ici.fr (France Bleu) zijn publieke omroepen: journalistiek, geen
  // autoriteit. Daarom soort 'pers', niet 'officieel'. Alleen préfecture en Atmo
  // blijven officieel.
  {
    naam: "France 3 Nouvelle-Aquitaine",
    url: "https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/rss",
    soort: "pers",
    paywall: false,
    regio: "Nouvelle-Aquitaine",
    bevestigd: true,
    actief: true,
    // 26-08-2026: verhuisd van /rss.xml (404) naar /rss. Getest: 30 items, van
    // dezelfde dag. Dekt Gironde en Landes — voor deze tool de belangrijkste
    // regio die nog een werkende feed heeft.
  },
  {
    naam: "ici.fr — landelijk",
    url: "https://www.ici.fr/rss",
    soort: "pers",
    paywall: false,
    regio: "landelijk",
    bevestigd: false,
    actief: false,
    // 26-08-2026: het adres bestaat maar levert een HTML-pagina, geen feed. Site
    // gelezen, geen feed aangekondigd; zeven beproefde adressen leverden niets.
  },
  {
    naam: "ici.fr — Gironde",
    url: "https://www.ici.fr/gironde/rss",
    soort: "pers",
    paywall: false,
    regio: "Gironde",
    bevestigd: false,
    actief: false,
    // 26-08-2026: HTTP 404; vijftien beproefde adressen leverden niets. Sinds de
    // naamswisseling van France Bleu naar ici.fr lijken de regionale feeds weg.
  },
  {
    naam: "ici.fr — Gascogne",
    url: "https://www.ici.fr/gascogne/rss",
    soort: "pers",
    paywall: false,
    regio: "Gascogne",
    bevestigd: false,
    actief: false,
    // 26-08-2026: HTTP 404; vijftien beproefde adressen leverden niets.
  },
  {
    naam: "ici.fr — Pays basque",
    url: "https://www.ici.fr/pays-basque/rss",
    soort: "pers",
    paywall: false,
    regio: "Pays basque",
    bevestigd: false,
    actief: false,
    // 26-08-2026: HTTP 404; vijftien beproefde adressen leverden niets.
  },

  // ---- PERS (staat onder in de weergave) -------------------------------------
  {
    naam: "Sud Ouest — faits divers",
    url: "https://www.sudouest.fr/faits-divers/rss.xml",
    soort: "pers",
    paywall: true,
    regio: "Gironde/Landes",
    bevestigd: true,
    actief: true,
    // 26-08-2026 getest: 20 items, van dezelfde dag.
  },
  {
    naam: "Midi Libre — faits divers",
    url: "https://www.midilibre.fr/faits-divers/rss.xml",
    soort: "pers",
    paywall: true,
    regio: "Occitanie",
    bevestigd: true,
    actief: true,
    // 26-08-2026 getest: 25 items, van dezelfde dag.
  },
  {
    naam: "Le Parisien — Seine-et-Marne",
    url: "https://feeds.leparisien.fr/leparisien/seine-et-marne",
    soort: "pers",
    paywall: true,
    regio: "Île-de-France",
    bevestigd: false,
    actief: false,
    // 26-08-2026: HTTP 404. De feedcontrole vond wél een werkend adres
    // (https://feeds.leparisien.fr/leparisien/rss, 100 items), maar dat is
    // BEWUST niet overgenomen, om twee redenen. Het is een andere bron: de
    // landelijke Le Parisien-feed in plaats van de sectie Seine-et-Marne. En
    // die feed levert geen datums, terwijl de datumpoort een item zonder
    // bruikbare datum hard weigert — hij zou dus structureel nul items
    // opleveren en alleen maar gezond lijken in de bronstatus.
  },
  {
    naam: "Corse-Matin",
    url: "https://www.corsematin.com/rss",
    soort: "pers",
    paywall: true,
    regio: "Corsica",
    bevestigd: false,
    actief: false,
    // 26-08-2026: HTTP 404. Site gelezen, geen feed aangekondigd; zeven
    // beproefde adressen leverden niets. Corsica valt daarmee weg als eigen
    // bron; natuurbranden daar komen hooguit binnen via de landelijke pers.
  },
  {
    naam: "France 3 Paris Île-de-France",
    url: "https://france3-regions.francetvinfo.fr/paris-ile-de-france/rss",
    soort: "pers",
    paywall: false,
    regio: "Île-de-France",
    bevestigd: true,
    actief: true,
    // 26-08-2026: verhuisd van /rss.xml (404) naar /rss. Getest: 30 items.
  },
  {
    naam: "France 3 Provence-Alpes-Côte d'Azur",
    url: "https://france3-regions.francetvinfo.fr/provence-alpes-cote-d-azur/rss",
    soort: "pers",
    paywall: false,
    regio: "PACA",
    bevestigd: true,
    actief: true,
    // 26-08-2026: verhuisd van /rss.xml (404) naar /rss. Getest: 30 items.
    // Dekt Var en Bouches-du-Rhône: na Nouvelle-Aquitaine de belangrijkste
    // brandregio.
  },
];

// De bronnen die de route werkelijk ophaalt. Ook de host-allowlist wordt hieruit
// opgebouwd: een uitgezette bron mag geen domein openhouden.
export const ACTIEVE_BRONNEN: Nieuwsbron[] = NIEUWSBRONNEN.filter((b) => b.actief);
