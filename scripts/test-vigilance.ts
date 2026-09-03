// Offline zelftest voor de normalisatie van de Vigilance-API. Geen netwerk.
// Draaien:  node --experimental-strip-types scripts/test-vigilance.ts
//
// WAAROM DEZE TEST BESTAAT. Deze module leest een veiligheidssignaal: staat er
// oranje, dan zegt de tool tegen een lezer dat hij zeer waakzaam moet zijn. De
// normalisatie is ruim opgezet, omdat dezelfde API onder een oudere sleutel nog
// een 403 gaf en de zusterapi CSV bleek te sturen waar JSON werd verwacht.
// Precies daar zit het gevaar: een ruime parser die overal getallen oppikt,
// verzint met genoeg goede wil een complete kaart. Deze test legt vast wat hij
// NIET mag doen.
//
// Drie eigenschappen staan hieronder vast:
//
//   1. de termijntelling — Vigilance gebruikt J voor vandaag en J1 voor morgen,
//      terwijl de Météo des forêts J1 voor vandaag gebruikt. Wie die twee door
//      elkaar haalt schuift de hele kaart een dag op, en toont morgen z'n storm
//      als de situatie van vandaag;
//   2. de leegte — geen herkende data betekent een leeg departement, nooit
//      kleur 1 ("geen bijzonderheid"). Groen is een bewering, geen neutrale
//      toestand, en die bewering mogen we zonder data niet doen;
//   3. niets afleiden — de maximumkleur komt uit de API of nergens vandaan.
//      Zelf het hoogste fenomeen pakken zou een getal opleveren dat Météo-France
//      niet heeft afgegeven.

import assert from "node:assert/strict";
import {
  FENOMENEN,
  SEIZOENSGEBONDEN_FENOMENEN,
  VIGILANCE_KLEUREN,
  normaliseerVigilance,
  telDepartementen,
  termijnVan,
  waargenomenFenomenen,
} from "../lib/vigilance-normalisatie.ts";

let geslaagd = 0;
function check(voorwaarde: boolean, bericht: string) {
  assert.ok(voorwaarde, bericht);
  geslaagd += 1;
}

// --- 1. Termijntelling: de val die de kaart een dag verschuift --------------
check(termijnVan("J") === "vandaag", "J is vandaag, niet morgen");
check(termijnVan("J1") === "morgen", "J1 is morgen (bij de Météo des forêts is J1 juist vandaag)");
check(termijnVan("j+1") === "morgen", "j+1 is morgen");
check(termijnVan("demain") === "morgen", "demain is morgen");
check(termijnVan("J2") === null, "Vigilance kent geen J2; onbekend blijft onbekend");
check(termijnVan("kwark") === null, "onzin levert geen termijn op");

// --- 2. De werkelijke structuur van /cartevigilance/encours ----------------
// Vorm vastgesteld op 03-09-2026 tegen de live API (status 200, 96
// departementen). De veldnamen hieronder zijn die van de echte respons.
const respons = {
  product: {
    warning_type: "vigilance",
    version_vigilance: 2,
    update_time: "2026-09-03T04:00:07Z",
    domain_id: "FRA",
    global_max_color_id: 2,
    periods: [
      {
        echeance: "J",
        begin_validity_time: "2026-09-03T04:00:00Z",
        end_validity_time: "2026-09-04T04:00:00Z",
        text_items: { title: "Vigilance", text: "…" },
        timelaps: {
          domain_ids: [
            {
              domain_id: "11",
              max_color_id: 2,
              phenomenon_items: [{ phenomenon_id: "6", phenomenon_max_color_id: 2 }],
            },
            {
              domain_id: "2A",
              max_color_id: 1,
              phenomenon_items: [{ phenomenon_id: "1", phenomenon_max_color_id: 1 }],
            },
            { domain_id: "84", max_color_id: 1, phenomenon_items: [] },
          ],
        },
      },
      {
        echeance: "J1",
        begin_validity_time: "2026-09-04T04:00:00Z",
        end_validity_time: "2026-09-05T04:00:00Z",
        timelaps: {
          domain_ids: [
            {
              domain_id: "84",
              max_color_id: 2,
              phenomenon_items: [{ phenomenon_id: "6", phenomenon_max_color_id: 2 }],
            },
          ],
        },
      },
    ],
  },
  meta: { snapshot_id: "abc", product_datetime: "2026-09-03T04:00:07Z" },
};

const data = normaliseerVigilance(respons);

check(data.departementen["11"].vandaag.max === 2, "Aude staat vandaag op geel");
check(
  data.departementen["11"].vandaag.fenomenen[6] === 2,
  "hitte (6) staat vandaag op geel in de Aude"
);
check(data.departementen["2A"].vandaag.max === 1, "Corsica 2A wordt als departement herkend");
check(data.bijgewerkt === "2026-09-03T04:00:07Z", "de publicatietijd komt uit product.update_time");
check(telDepartementen(data) === 3, "drie departementen met data");

// product.domain_id is "FRA" en global_max_color_id staat ernaast. Een parser
// die alles oppikt zou daar een departement in zien; dat mag niet.
check(
  Object.keys(data.departementen).sort().join(",") === "11,2A,84",
  "alleen echte departementcodes, geen FRA uit product.domain_id"
);

// De kern van eigenschap 1: Vaucluse (84) is vandaag rustig en morgen geel.
// Lekt de termijn, dan staat er vandaag al een waarschuwing die er niet is.
check(data.departementen["84"].vandaag.max === 1, "Vaucluse is vandaag rustig");
check(data.departementen["84"].morgen.max === 2, "Vaucluse is morgen geel");
check(
  data.departementen["84"].vandaag.fenomenen[6] === undefined,
  "de hitte van morgen staat niet bij vandaag"
);
check(
  data.departementen["11"].morgen.max === null,
  "de Aude komt in J1 niet voor en krijgt dus geen waarde uit J"
);

// --- 2b. Ontbrekend fenomeen is "niet beoordeeld", nooit niveau 1 ----------
// Op 03-09-2026 stuurde de API alleen de ID's 1 t/m 6 mee. Wie de afwezigheid
// van 8 leest als "geen lawinegevaar", verzint een geruststelling.
check(
  data.departementen["11"].vandaag.fenomenen[8] === undefined,
  "een fenomeen dat de API niet noemt, ontbreekt — het wordt géén 1"
);
check(
  Object.keys(data.departementen["84"].vandaag.fenomenen).length === 0,
  "een leeg phenomenon_items levert geen enkel fenomeen op, ook niet op groen"
);

// --- 2c. De waarnemingslijst -----------------------------------------------
const waargenomen = waargenomenFenomenen(data);
check(waargenomen.length === 2, "twee verschillende fenomeen-ID's in deze respons");
const hitte = waargenomen.find((f) => f.id === 6)!;
check(hitte.naam === "hitte", "ID 6 is hitte");
check(hitte.aantalDepartementen === 2, "hitte is in twee departementen gezien (11 vandaag, 84 morgen)");

// --- 2d. De tabel komt uit de primaire bron --------------------------------
// "Descriptif technique des informations Vigilance METROPOLE", sectie Carte,
// pagina 7. Alle negen ID's staan daarin, dus alle negen zijn bevestigd; wat
// er níét in staat, hoort false te zijn.
check(
  Object.values(FENOMENEN).every((f) => f.bevestigd),
  "alle negen fenomenen staan in het descriptif technique"
);
check(Object.keys(FENOMENEN).length === 9, "precies negen, niet meer en niet minder");
check(FENOMENEN[10] === undefined, "een tiende bestaat niet in de bron");

// De twee namen die vóór het lezen van de bron fout stonden. ID 4 is de
// belangrijkste: crues is hoogwater in rivieren (het domein van Vigicrues), en
// niet "inondation". Zonder dat onderscheid valt het verschil met ID 9 weg, dat
// juist over water vanáf zee gaat.
check(FENOMENEN[2].fr === "pluie", 'ID 2 heet "pluie" in de bron, niet "pluie-inondation"');
check(FENOMENEN[4].fr === "crues", 'ID 4 heet "crues", niet "inondation"');
check(
  FENOMENEN[4].nl === "hoogwater in rivieren",
  "…en de Nederlandse naam maakt het onderscheid met ID 9 zichtbaar"
);
check(
  FENOMENEN[9].nl.includes("zee") && !FENOMENEN[4].nl.includes("zee"),
  "9 komt van zee, 4 niet: die twee mogen niet op elkaar lijken"
);

// Canicule en grand froid zitten alleen seizoensgebonden in het carte-product.
// Hun afwezigheid is dus normaal, en nog steeds "niet beoordeeld".
check(
  SEIZOENSGEBONDEN_FENOMENEN.includes(6) && SEIZOENSGEBONDEN_FENOMENEN.includes(7),
  "canicule (6) en grand froid (7) staan als seizoensgebonden te boek"
);
check(SEIZOENSGEBONDEN_FENOMENEN.length === 2, "en verder geen enkel fenomeen");

// --- 2e. De kleurschaal: officiële waarde náást de gebruikte tint -----------
check(VIGILANCE_KLEUREN[1].fr === "vert" && VIGILANCE_KLEUREN[4].fr === "rouge", "1 vert … 4 rouge");
check(Object.keys(VIGILANCE_KLEUREN).length === 4, "vier kleuren, niet vijf");
check(
  VIGILANCE_KLEUREN[2].officieleKleur === "#f9ff00",
  "de officiële RVB uit het document staat vast"
);
check(
  Object.values(VIGILANCE_KLEUREN).every((k) => k.kleur !== k.officieleKleur),
  "de gebruikte tinten wijken bewust af van de officiële; beide staan er"
);

// --- 3. Leegte blijft leeg, en wordt nooit groen ----------------------------
const leeg = normaliseerVigilance({ product: { periods: [] } });
check(telDepartementen(leeg) === 0, "geen data levert nul departementen");
check(
  Object.keys(leeg.departementen).length === 0,
  "geen data levert geen enkel departement, ook geen groen ingevuld"
);

const onzin = normaliseerVigilance({ boodschap: "service tijdelijk niet beschikbaar" });
check(telDepartementen(onzin) === 0, "een foutbody levert geen kaart op");

// Een departement dat de API noemt zonder bruikbare kleur telt niet mee: er
// valt niets over te zeggen, dus staat er niets.
const zonderKleur = normaliseerVigilance({
  domain_ids: [{ domain_id: "33", phenomenon_items: [] }],
});
check(
  telDepartementen(zonderKleur) === 0,
  "een departement zonder kleur telt niet mee als 'bekend'"
);

// --- 4. Niets afleiden: max komt uit de API of nergens vandaan --------------
const zonderMax = normaliseerVigilance({
  echeance: "J",
  domain_ids: [
    { domain_id: "75", phenomenon_items: [{ phenomenon_id: "6", phenomenon_max_color_id: 3 }] },
  ],
});
check(
  zonderMax.departementen["75"].vandaag.max === null,
  "zonder max_color_id blijft de maximumkleur null, ook al is er een oranje fenomeen"
);
check(
  zonderMax.departementen["75"].vandaag.fenomenen[6] === 3,
  "het fenomeen zelf wordt wél bewaard"
);

// --- 5. Waardebereik: buiten 1–4 is geen Vigilance-kleur --------------------
const buitenBereik = normaliseerVigilance({
  echeance: "J",
  domain_ids: [
    {
      domain_id: "59",
      max_color_id: 7,
      phenomenon_items: [
        { phenomenon_id: "1", phenomenon_max_color_id: 0 },
        { phenomenon_id: "5", phenomenon_max_color_id: 2 },
      ],
    },
  ],
});
check(buitenBereik.departementen["59"].vandaag.max === null, "kleur 7 bestaat niet en wordt genegeerd");
check(
  buitenBereik.departementen["59"].vandaag.fenomenen[1] === undefined,
  "kleur 0 bestaat niet en wordt genegeerd"
);
check(
  buitenBereik.departementen["59"].vandaag.fenomenen[5] === 2,
  "de geldige buurwaarde blijft wel staan"
);

// --- 6. Een onbekend fenomeen verdwijnt niet stilletjes ---------------------
// Voegt Météo-France een tiende gevaar toe, dan hoort dat zichtbaar te worden
// in de debugroute, niet weggefilterd omdat onze tabel het niet kent.
const nieuwGevaar = normaliseerVigilance({
  echeance: "J",
  domain_ids: [
    { domain_id: "06", max_color_id: 2, phenomenon_items: [{ phenomenon_id: "10", phenomenon_max_color_id: 2 }] },
  ],
});
check(
  nieuwGevaar.departementen["06"].vandaag.fenomenen[10] === 2,
  "een onbekend fenomeen-ID wordt bewaard, niet weggegooid"
);
check(FENOMENEN[10] === undefined, "…en staat inderdaad nog niet in de vertaaltabel");

// --- 7. Geen valse departementen uit toevallige getallen --------------------
// Een ruime parser is gevaarlijk: elk tweecijferig getal in de boom lijkt op
// een departementcode. Een versienummer mag geen kaart worden.
const ruis = normaliseerVigilance({
  api_version: "01",
  page: 2,
  meta: { total: 96, code: "99" },
});
check(telDepartementen(ruis) === 0, "losse getallen in metadata leveren geen departementen op");

// --- 8. Een onbekende termijn wordt genegeerd, niet op vandaag gelegd -------
// Zou Météo-France een derde periode toevoegen (J2, overmorgen), dan viel die
// eerder terug op "vandaag" en stond overmorgen als de situatie van nu op de
// kaart. Een dag te vroeg waarschuwen is verwarrend; een dag te vroeg
// gerúststellen is gevaarlijk. Onbekend hoort dus nergens te belanden.
const metJ2 = normaliseerVigilance({
  product: {
    periods: [
      {
        echeance: "J",
        timelaps: {
          domain_ids: [
            {
              domain_id: "13",
              max_color_id: 1,
              phenomenon_items: [{ phenomenon_id: "1", phenomenon_max_color_id: 1 }],
            },
          ],
        },
      },
      {
        echeance: "J2",
        timelaps: {
          domain_ids: [
            {
              domain_id: "13",
              max_color_id: 4,
              phenomenon_items: [{ phenomenon_id: "1", phenomenon_max_color_id: 4 }],
            },
          ],
        },
      },
    ],
  },
});
check(metJ2.departementen["13"].vandaag.max === 1, "de J-periode wordt gewoon gelezen");
check(
  metJ2.departementen["13"].vandaag.fenomenen[1] === 1,
  "…inclusief het fenomeen van vandaag"
);
check(
  metJ2.departementen["13"].morgen.max === null,
  "het rood van J2 belandt niet op morgen"
);
check(
  Object.values(metJ2.departementen["13"]).every((v) => v.max !== 4),
  "het rood van J2 belandt nergens: onbekende termijn wordt overgeslagen"
);

// Datzelfde geldt zonder termijn. Een departement dat buiten elke periode in de
// boom opduikt, is niet te plaatsen in de tijd en levert dus geen waarde op.
const zonderTermijn = normaliseerVigilance({
  domain_ids: [{ domain_id: "44", max_color_id: 3 }],
});
check(
  telDepartementen(zonderTermijn) === 0,
  "zonder termijn valt er niets te plaatsen, dus wordt er niets bewaard"
);

// --- 9. Crues (ID 4): lege timelaps, kleur uit phenomenon_max_color_id ------
// Uit het descriptif technique: "pour le phénomène crues (phenomenon_id 4), les
// tableaux [timelaps] sont vides pour J et J1". Wie de kleur uit een
// timelaps-reeks zou halen, ziet crues dus altijd als ontbrekend — dat wil
// zeggen: als niet beoordeeld, terwijl Météo-France het wél heeft beoordeeld.
// Voor iemand aan een rivier is dat het verkeerde soort stilte.
const metCrues = normaliseerVigilance({
  product: {
    periods: [
      {
        echeance: "J",
        timelaps: {
          domain_ids: [
            {
              domain_id: "45",
              max_color_id: 3,
              phenomenon_items: [
                { phenomenon_id: "4", phenomenon_max_color_id: 3, timelaps_items: [] },
                { phenomenon_id: "1", phenomenon_max_color_id: 2, timelaps_items: [{ color_id: 2 }] },
              ],
            },
          ],
        },
      },
    ],
  },
});
check(
  metCrues.departementen["45"].vandaag.fenomenen[4] === 3,
  "crues krijgt zijn kleur uit phenomenon_max_color_id, ondanks lege timelaps"
);
check(
  metCrues.departementen["45"].vandaag.fenomenen[1] === 2,
  "…en de andere fenomenen blijven gewoon werken"
);

// --- 10. Eén periode vóór 06:00 Parijse tijd -------------------------------
// Uit het descriptif technique: "Entre 0h et 6h locales un seul bloc (J)".
// "Morgen" bestaat dan niet. Dat mag geen afgeleide waarde opleveren, en het
// mag de kaart van vandaag niet ongeldig maken.
const alleenVandaag = normaliseerVigilance({
  product: {
    update_time: "2026-11-14T02:30:00Z",
    periods: [
      {
        echeance: "J",
        timelaps: {
          domain_ids: [
            {
              domain_id: "38",
              max_color_id: 3,
              phenomenon_items: [{ phenomenon_id: "8", phenomenon_max_color_id: 3 }],
            },
          ],
        },
      },
    ],
  },
});
check(telDepartementen(alleenVandaag) === 1, "één periode levert gewoon een bruikbare kaart op");
check(alleenVandaag.departementen["38"].vandaag.max === 3, "vandaag staat op oranje");
check(
  alleenVandaag.departementen["38"].morgen.max === null,
  "morgen blijft leeg en wordt niet uit vandaag afgeleid"
);
check(
  Object.keys(alleenVandaag.departementen["38"].morgen.fenomenen).length === 0,
  "…ook geen fenomenen die van vandaag zijn overgewaaid"
);

console.log(`OK — ${geslaagd} eigenschappen vastgelegd voor de Vigilance-normalisatie.`);
