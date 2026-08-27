// Zelftest voor het samenvatten van de brandbeoordeling op clusterniveau.
// Draaien:  node --experimental-strip-types scripts/test-rookbeoordeling.ts
//
// WAAROM DEZE TEST BESTAAT. De rookkaart tekende een pluim voor élke hittebron
// en negeerde de beoordeling die lib/firms.ts al berekende. Nu ze is aangesloten
// hangt er een zichtbare bewering aan: een ring op de kaart en de regel
// "waarschijnlijke natuurbrand".
//
// De eerste versie daarvan was fout, en de fout is leerzaam. Een bron in de Gers
// van 7,1 MW kreeg de kop "waarschijnlijke natuurbrand", terwijl de duider er in
// dezelfde popup onder schreef: "klein, vergelijkbaar met een brandende schuur".
// De markering sprak zichzelf tegen over precies het onderscheid dat ze moest
// maken. Daarom staan hier drie eigenschappen vast:
//
//   1. de FRP-poort — onder de kleinste band van de FRP-schaal nooit een
//      markering, hoe overtuigend de detectiesignalen ook zijn;
//   2. de richting van de detectiepoort — bóven die band is één beoordeelde
//      meting genoeg, want een echte brand niet markeren is de dure fout;
//   3. de onderbouwing — de getoonde signalen komen alleen van de metingen die
//      de drempel haalden, anders onderbouwt de tekst iets anders dan het
//      oordeel erboven.

import assert from "node:assert/strict";
import { vatBeoordelingSamen, type BeoordeeldeMeting } from "../lib/rookbeoordeling.ts";
import { FRP_KLEIN_MAX_MW } from "../lib/frp-schaal.ts";
import { SIGNAAL } from "../lib/brandsignalen.ts";

let geslaagd = 0;
function test(naam: string, fn: () => void) {
  fn();
  geslaagd += 1;
  console.log(`  ✓ ${naam}`);
}

const meting = (
  waarschijnlijkNatuurbrand: boolean,
  waarschijnlijkheidsRedenen: string[] = []
): BeoordeeldeMeting => ({ waarschijnlijkNatuurbrand, waarschijnlijkheidsRedenen });

// Ruim boven de schuurgrens: tests over de detectiepoort mogen niet stilletjes
// op de FRP-poort stuklopen.
const GROOT = 50;

console.log("Beoordeling van een rookcluster:");

// ---- 1. De FRP-poort ------------------------------------------------------

test("de gemelde bron van 7,1 MW krijgt géén markering", () => {
  // Het echte geval uit de Gers: twee metingen, beide beoordeeld, met
  // overtuigende signalen — maar schuur-formaat volgens de eigen FRP-schaal.
  const r = vatBeoordelingSamen(
    [
      meting(true, ["nabijgelegen aanvullende meting", "verhoogd uitgestraald warmtevermogen"]),
      meting(true, ["nabijgelegen aanvullende meting", "verhoogd uitgestraald warmtevermogen"]),
    ],
    7.1
  );
  assert.equal(r.waarschijnlijkNatuurbrand, false, "7,1 MW heet in deze tool schuur-formaat");
});

test("net onder de schaalgrens: geen markering", () => {
  const r = vatBeoordelingSamen([meting(true, ["x"])], FRP_KLEIN_MAX_MW - 0.1);
  assert.equal(r.waarschijnlijkNatuurbrand, false);
});

test("precies op de schaalgrens: wél een markering", () => {
  // grootteordeFrp() noemt alles ONDER de grens klein; de grens zelf hoort al
  // bij de volgende band en mag dus gemarkeerd worden.
  const r = vatBeoordelingSamen([meting(true, ["x"])], FRP_KLEIN_MAX_MW);
  assert.equal(r.waarschijnlijkNatuurbrand, true);
});

test("de FRP-poort wint van nog zo veel detectiesignalen", () => {
  const metingen = [...Array(30)].map(() => meting(true, ["a", "b", "c"]));
  const r = vatBeoordelingSamen(metingen, 2);
  assert.equal(r.waarschijnlijkNatuurbrand, false, "klein blijft klein, ook met 30 metingen");
});

test("onbekende FRP telt niet als klein", () => {
  // Afwezige data is geen meting: we mogen er niet uit afleiden dat de bron
  // klein is. De detectiesignalen beslissen dan alleen.
  assert.equal(vatBeoordelingSamen([meting(true, ["x"])], null).waarschijnlijkNatuurbrand, true);
  assert.equal(
    vatBeoordelingSamen([meting(true, ["x"])], undefined).waarschijnlijkNatuurbrand,
    true
  );
});

test("de teller en de signalen blijven kloppen als de FRP-poort dichtzit", () => {
  // Het oordeel is 'nee', maar de onderliggende cijfers blijven waar — ze mogen
  // niet stiekem op nul worden gezet.
  const r = vatBeoordelingSamen([meting(true, ["reden"]), meting(false)], 3);
  assert.equal(r.waarschijnlijkNatuurbrand, false);
  assert.equal(r.natuurbrandDetecties, 1);
  assert.deepEqual(r.signalen, ["reden"]);
});

// ---- 2. De detectiepoort --------------------------------------------------

test("een leeg cluster levert geen oordeel", () => {
  const r = vatBeoordelingSamen([], GROOT);
  assert.equal(r.waarschijnlijkNatuurbrand, false);
  assert.equal(r.natuurbrandDetecties, 0);
  assert.deepEqual(r.signalen, []);
});

test("alleen niet-beoordeelde metingen leveren geen oordeel", () => {
  const r = vatBeoordelingSamen([meting(false, ["x"]), meting(false, ["y"])], GROOT);
  assert.equal(r.waarschijnlijkNatuurbrand, false);
  assert.equal(r.natuurbrandDetecties, 0);
});

test("één beoordeelde meting tussen negen andere is genoeg", () => {
  const metingen = [...Array(9)].map(() => meting(false));
  metingen.push(meting(true, ["hoge VIIRS-betrouwbaarheid"]));
  const r = vatBeoordelingSamen(metingen, GROOT);
  assert.equal(r.waarschijnlijkNatuurbrand, true, "de drempel is bewust asymmetrisch");
  assert.equal(r.natuurbrandDetecties, 1);
});

test("de teller telt alleen beoordeelde metingen, niet alle metingen", () => {
  const r = vatBeoordelingSamen(
    [meting(true), meting(false), meting(true), meting(false)],
    GROOT
  );
  assert.equal(r.natuurbrandDetecties, 2);
});

test("een beoordeelde meting zonder redenen levert wél een oordeel", () => {
  // Het oordeel hangt aan de vlag, niet aan de aanwezigheid van tekst; de
  // detailregel moet dan gewoon zonder signalenzin kunnen renderen.
  const r = vatBeoordelingSamen([meting(true, [])], GROOT);
  assert.equal(r.waarschijnlijkNatuurbrand, true);
  assert.deepEqual(r.signalen, []);
});

// ---- 3. De onderbouwing ---------------------------------------------------

test("twee standen van dezelfde meter worden niet allebei getoond", () => {
  // Het echte geval uit de Haute-Garonne: zes detecties, waarvan sommige boven
  // en sommige onder de 10 MW. Per detectie sluiten "sterk" en "verhoogd"
  // elkaar uit, maar over het cluster heen stonden ze allebei in de lijst.
  const r = vatBeoordelingSamen(
    [meting(true, [SIGNAAL.frpVerhoogd]), meting(true, [SIGNAAL.frpSterk])],
    80.6
  );
  assert.deepEqual(r.signalen, [SIGNAAL.frpSterk], "de zwakkere stand valt weg");
});

test("ook de nabijheids-as ontdubbelt", () => {
  const r = vatBeoordelingSamen(
    [meting(true, [SIGNAAL.nabijheidEnkel]), meting(true, [SIGNAAL.nabijheidVeel])],
    GROOT
  );
  assert.deepEqual(r.signalen, [SIGNAAL.nabijheidVeel]);
});

test("de zwakkere stand blijft staan als de sterkere ontbreekt", () => {
  const r = vatBeoordelingSamen([meting(true, [SIGNAAL.frpVerhoogd])], GROOT);
  assert.deepEqual(r.signalen, [SIGNAAL.frpVerhoogd]);
});

test("ontdubbelen raakt alleen de eigen as", () => {
  const r = vatBeoordelingSamen(
    [
      meting(true, [SIGNAAL.frpVerhoogd, SIGNAAL.ruimtelijkCluster]),
      meting(true, [SIGNAAL.frpSterk, SIGNAAL.betrouwbaarheidHoog]),
    ],
    GROOT
  );
  assert.ok(!r.signalen.includes(SIGNAAL.frpVerhoogd));
  assert.ok(r.signalen.includes(SIGNAAL.ruimtelijkCluster));
  assert.ok(r.signalen.includes(SIGNAAL.betrouwbaarheidHoog));
  assert.ok(r.signalen.includes(SIGNAAL.frpSterk));
});

test("signalen van niet-beoordeelde metingen tellen niet mee", () => {
  const r = vatBeoordelingSamen(
    [
      meting(true, ["sterk uitgestraald warmtevermogen"]),
      meting(false, ["deze reden mag nergens opduiken"]),
    ],
    GROOT
  );
  assert.deepEqual(r.signalen, ["sterk uitgestraald warmtevermogen"]);
});

test("dezelfde reden verschijnt één keer, niet per meting", () => {
  const r = vatBeoordelingSamen(
    [
      meting(true, ["hoge VIIRS-betrouwbaarheid"]),
      meting(true, ["hoge VIIRS-betrouwbaarheid"]),
      meting(true, ["hoge VIIRS-betrouwbaarheid"]),
    ],
    GROOT
  );
  assert.deepEqual(r.signalen, ["hoge VIIRS-betrouwbaarheid"]);
  assert.equal(r.natuurbrandDetecties, 3);
});

test("de vaakst voorkomende reden staat vooraan", () => {
  const r = vatBeoordelingSamen(
    [meting(true, ["zelden", "vaak"]), meting(true, ["vaak"]), meting(true, ["vaak"])],
    GROOT
  );
  assert.deepEqual(r.signalen, ["vaak", "zelden"]);
});

test("bij een gelijk aantal is de volgorde alfabetisch en dus herhaalbaar", () => {
  // De route cachet haar antwoord; dezelfde invoer moet altijd dezelfde uitvoer
  // geven, ook als de metingen in een andere volgorde binnenkomen.
  const eerste = vatBeoordelingSamen([meting(true, ["beta"]), meting(true, ["alfa"])], GROOT);
  const tweede = vatBeoordelingSamen([meting(true, ["alfa"]), meting(true, ["beta"])], GROOT);
  assert.deepEqual(eerste.signalen, ["alfa", "beta"]);
  assert.deepEqual(eerste.signalen, tweede.signalen);
});

console.log(`\n✓ ${geslaagd}/${geslaagd} tests geslaagd — clusterbeoordeling werkt.`);
