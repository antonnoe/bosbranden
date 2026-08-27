// Zelftest voor de koppeling tussen een gemeten brandhaard en een persbericht.
// Draaien:  node --experimental-strip-types scripts/test-mediakoppeling.ts
//
// WAAROM DEZE TEST BESTAAT. De koppeling doet een harde bewering aan de lezer:
// "Sud Ouest meldt een brand bij Saint-Gaudens", mét link. Eén verkeerde
// koppeling — het juiste soort bericht bij het verkeerde dorp — kost meer dan
// tien gemiste. Alle drempels staan daarom streng, en deze test bewaakt dat ze
// streng blijven.
//
// Wat hier NIET wordt getest is of er treffers zíjn: dat hangt af van zes
// regionale feeds die grote delen van Frankrijk niet dekken. Geen treffer is de
// normale toestand en betekent niets — zie het voorbehoud in
// lib/mediakoppeling.ts.

import assert from "node:assert/strict";
import {
  berichtPastBijHaard,
  besteTrefferVoorHaard,
  departementUitCitycode,
  haalPlaatsnamenUitKop,
  kiesOndubbelzinnig,
  MIN_GEOCODER_SCORE,
  type Brandhaard,
  type GeocodeKandidaat,
  type Kandidaatbericht,
} from "../lib/mediakoppeling.ts";

let geslaagd = 0;
function test(naam: string, fn: () => void) {
  fn();
  geslaagd += 1;
  console.log(`  ✓ ${naam}`);
}

console.log("Koppeling satellietmelding ↔ pers:");

// ---- 1. Plaatsnaam uit de kop --------------------------------------------

test("gewone koppen leveren de gemeente op", () => {
  assert.deepEqual(haalPlaatsnamenUitKop("Incendie à Saint-Gaudens : 30 hectares brûlés"), [
    "Saint-Gaudens",
  ]);
  assert.deepEqual(
    haalPlaatsnamenUitKop("Gironde : un incendie ravage la forêt près de Landiras"),
    ["Landiras"]
  );
  assert.deepEqual(
    haalPlaatsnamenUitKop("Haute-Garonne : feu de végétation à Boulogne-sur-Gesse"),
    ["Boulogne-sur-Gesse"]
  );
});

test("namen met apostrof en met kleine tussenwoorden blijven heel", () => {
  assert.deepEqual(haalPlaatsnamenUitKop("Feu de broussailles à L'Isle-Jourdain"), [
    "L'Isle-Jourdain",
  ]);
  assert.deepEqual(haalPlaatsnamenUitKop("Incendie à Villeneuve-lès-Avignon maîtrisé"), [
    "Villeneuve-lès-Avignon",
  ]);
});

test("een kop zonder plaats levert niets op", () => {
  assert.deepEqual(haalPlaatsnamenUitKop("Les pompiers luttent contre un feu de maquis"), []);
});

test("het departement vooraan wordt niet voor een gemeente aangezien", () => {
  // "Haute-Garonne :" staat vóór het voorzetsel en telt dus niet mee — precies
  // de reden dat alleen namen ná een voorzetsel worden opgepakt.
  const namen = haalPlaatsnamenUitKop("Haute-Garonne : feu de végétation à Boulogne-sur-Gesse");
  assert.ok(!namen.includes("Haute-Garonne"));
});

test("de rest van de zin wordt niet meegesleept", () => {
  const namen = haalPlaatsnamenUitKop("Incendie à Foix, les pompiers sont sur place");
  assert.deepEqual(namen, ["Foix"]);
});

// ---- 2. Ondubbelzinnigheid van de geocoder --------------------------------

const plaats = (
  over: Partial<GeocodeKandidaat> & Pick<GeocodeKandidaat, "score" | "citycode">
): GeocodeKandidaat => ({
  city: "Ergens",
  latitude: 43.1,
  longitude: 0.9,
  ...over,
});

test("een lage score levert geen plaats op", () => {
  const r = kiesOndubbelzinnig([plaats({ score: MIN_GEOCODER_SCORE - 0.01, citycode: "31483" })]);
  assert.equal(r, null);
});

test("twee bijna even goede kandidaten leveren niets op", () => {
  // Frankrijk telt tientallen Saint-Martins; zonder duidelijk verschil zou de
  // geocoder er feitelijk willekeurig één kiezen.
  const r = kiesOndubbelzinnig([
    plaats({ score: 0.9, citycode: "31483" }),
    plaats({ score: 0.85, citycode: "33063" }),
  ]);
  assert.equal(r, null);
});

test("een duidelijke winnaar wordt wél gekozen", () => {
  const r = kiesOndubbelzinnig([
    plaats({ score: 0.95, citycode: "31483", city: "Saint-Gaudens" }),
    plaats({ score: 0.4, citycode: "33063" }),
  ]);
  assert.equal(r?.city, "Saint-Gaudens");
});

test("één enkele goede kandidaat is genoeg", () => {
  const r = kiesOndubbelzinnig([plaats({ score: 0.9, citycode: "31483" })]);
  assert.ok(r);
});

// ---- 3. Departement uit de INSEE-code -------------------------------------

test("departementscode komt uit de gemeentecode", () => {
  assert.equal(departementUitCitycode("31483"), "31");
  assert.equal(departementUitCitycode("01004"), "01");
});

test("Corsica houdt 2A en 2B", () => {
  assert.equal(departementUitCitycode("2A004"), "2A");
  assert.equal(departementUitCitycode("2B033"), "2B");
});

test("onzin levert geen departement op", () => {
  assert.equal(departementUitCitycode(""), null);
  assert.equal(departementUitCitycode("abc"), null);
  assert.equal(departementUitCitycode("314"), null);
});

// ---- 4. De drie harde eisen ----------------------------------------------

const haard: Brandhaard = {
  lat: 43.1,
  lon: 0.72,
  departementCode: "31",
  laatsteDetectie: "2026-08-26T14:40:00Z",
};

const bericht = (over: Partial<Kandidaatbericht> = {}): Kandidaatbericht => ({
  titel: "Incendie à Saint-Gaudens",
  url: "https://www.midilibre.fr/artikel",
  bron: "Midi Libre",
  gepubliceerdOp: "2026-08-26T18:00:00Z",
  plaats: plaats({ score: 0.95, citycode: "31483", city: "Saint-Gaudens" }),
  ...over,
});

test("dichtbij, zelfde departement, kort erna: treffer", () => {
  assert.equal(berichtPastBijHaard(bericht(), haard), true);
});

test("ander departement: geen treffer, ook al ligt het dichtbij", () => {
  // Dit is de eis die gelijknamige gemeenten elders uitsluit.
  const elders = bericht({ plaats: plaats({ score: 0.95, citycode: "65321" }) });
  assert.equal(berichtPastBijHaard(elders, haard), false);
});

test("te ver weg: geen treffer, ook binnen hetzelfde departement", () => {
  const ver = bericht({
    plaats: plaats({ score: 0.95, citycode: "31555", latitude: 43.6, longitude: 1.44 }),
  });
  assert.equal(berichtPastBijHaard(ver, haard), false);
});

test("te lang erna: geen treffer", () => {
  const oud = bericht({ gepubliceerdOp: "2026-08-29T18:00:00Z" });
  assert.equal(berichtPastBijHaard(oud, haard), false);
});

test("kort vóór de meting mag wel", () => {
  // Een brand die gisteravond begon staat vanochtend in de krant en wordt pas
  // daarna weer gemeten.
  const eerder = bericht({ gepubliceerdOp: "2026-08-26T06:00:00Z" });
  assert.equal(berichtPastBijHaard(eerder, haard), true);
});

test("een haard zonder departement koppelt nooit", () => {
  const zonder: Brandhaard = { ...haard, departementCode: null };
  assert.equal(berichtPastBijHaard(bericht(), zonder), false);
});

test("onleesbare datums koppelen nooit", () => {
  assert.equal(berichtPastBijHaard(bericht({ gepubliceerdOp: "morgen" }), haard), false);
  assert.equal(
    berichtPastBijHaard(bericht(), { ...haard, laatsteDetectie: "ooit" }),
    false
  );
});

// ---- 5. Kiezen tussen meerdere passende berichten -------------------------

test("zonder passend bericht komt er niets", () => {
  assert.equal(besteTrefferVoorHaard([], haard), null);
  const elders = bericht({ plaats: plaats({ score: 0.95, citycode: "65321" }) });
  assert.equal(besteTrefferVoorHaard([elders], haard), null);
});

test("van meerdere passende berichten wint het dichtstbijzijnde", () => {
  const dichtbij = bericht({
    url: "https://www.midilibre.fr/dichtbij",
    plaats: plaats({ score: 0.95, citycode: "31483", city: "Dichtbij", latitude: 43.1, longitude: 0.72 }),
  });
  const verder = bericht({
    url: "https://www.midilibre.fr/verder",
    plaats: plaats({ score: 0.95, citycode: "31484", city: "Verder", latitude: 43.22, longitude: 0.72 }),
  });
  const treffer = besteTrefferVoorHaard([verder, dichtbij], haard);
  assert.equal(treffer?.plaats, "Dichtbij");
});

test("de treffer draagt bron, plaats en link mee", () => {
  const treffer = besteTrefferVoorHaard([bericht()], haard);
  assert.equal(treffer?.bron, "Midi Libre");
  assert.equal(treffer?.plaats, "Saint-Gaudens");
  assert.equal(treffer?.url, "https://www.midilibre.fr/artikel");
});

console.log(`\n✓ ${geslaagd}/${geslaagd} tests geslaagd — mediakoppeling werkt.`);
