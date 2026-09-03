// Offline zelftest voor de normalisatie van de Vigilance-API. Geen netwerk.
// Draaien:  node --experimental-strip-types scripts/test-vigilance.ts
//
// WAAROM DEZE TEST BESTAAT. Deze module leest een veiligheidssignaal: staat er
// oranje, dan zegt de tool tegen een lezer dat hij zeer waakzaam moet zijn. De
// responsstructuur van deze API is niet publiek gedocumenteerd, dus de
// normalisatie is noodgedwongen ruim opgezet. Precies daar zit het gevaar: een
// ruime parser die overal getallen oppikt, verzint met genoeg goede wil een
// complete kaart. Deze test legt vast wat hij NIET mag doen.
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
  normaliseerVigilance,
  telDepartementen,
  termijnVan,
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

// --- 2. De verwachte structuur van /cartevigilance/encours ------------------
// Vorm zoals bekend uit werkende implementaties van derden. Nog niet tegen de
// officiële documentatie geverifieerd; /api/vigilance/debug toont de echte.
const respons = {
  product: {
    update_time: "2026-09-03T06:00:00Z",
    periods: [
      {
        echeance: "J",
        timelaps: {
          domain_ids: [
            {
              domain_id: "11",
              max_color_id: 3,
              phenomenon_items: [
                { phenomenon_id: "1", phenomenon_max_color_id: 3 },
                { phenomenon_id: "3", phenomenon_max_color_id: 2 },
              ],
            },
            {
              domain_id: "2A",
              max_color_id: 2,
              phenomenon_items: [{ phenomenon_id: "6", phenomenon_max_color_id: 2 }],
            },
          ],
        },
      },
      {
        echeance: "J1",
        timelaps: {
          domain_ids: [
            {
              domain_id: "11",
              max_color_id: 4,
              phenomenon_items: [{ phenomenon_id: "2", phenomenon_max_color_id: 4 }],
            },
          ],
        },
      },
    ],
  },
};

const data = normaliseerVigilance(respons);

check(data.departementen["11"].vandaag.max === 3, "Aude staat vandaag op oranje");
check(data.departementen["11"].morgen.max === 4, "Aude staat morgen op rood");
check(
  data.departementen["11"].vandaag.fenomenen[1] === 3,
  "zware wind (1) staat vandaag op oranje in de Aude"
);
check(
  data.departementen["11"].vandaag.fenomenen[3] === 2,
  "onweer (3) staat vandaag op geel in de Aude"
);
check(
  data.departementen["11"].morgen.fenomenen[2] === 4,
  "regen en wateroverlast (2) staat morgen op rood in de Aude"
);
check(data.departementen["2A"].vandaag.max === 2, "Corsica 2A wordt als departement herkend");
check(data.bijgewerkt === "2026-09-03T06:00:00Z", "de publicatietijd komt uit de API");
check(telDepartementen(data) === 2, "twee departementen met data");

// De kern van eigenschap 1: het fenomeen van morgen mag niet naar vandaag
// lekken, en andersom. Dit is de fout die een storm een dag verkeerd zet.
check(
  data.departementen["11"].vandaag.fenomenen[2] === undefined,
  "de regen van morgen staat niet bij vandaag"
);
check(
  data.departementen["11"].morgen.fenomenen[1] === undefined,
  "de wind van vandaag staat niet bij morgen"
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

console.log(`OK — ${geslaagd} eigenschappen vastgelegd voor de Vigilance-normalisatie.`);
