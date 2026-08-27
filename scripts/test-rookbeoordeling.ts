// Zelftest voor het samenvatten van de brandbeoordeling op clusterniveau.
// Draaien:  node --experimental-strip-types scripts/test-rookbeoordeling.ts
//
// WAAROM DEZE TEST BESTAAT. De rookkaart tekende een pluim voor élke hittebron
// en negeerde de beoordeling die lib/firms.ts al berekende. De brandkaart
// gebruikte haar wél, dus de twee kaarten zeiden verschillende dingen over
// dezelfde meting. Nu ze is aangesloten, hangt er een zichtbare bewering aan:
// een ring op de kaart en de regel "waarschijnlijke natuurbrand". Twee eigen-
// schappen mogen daarom nooit stilletjes omslaan:
//
//   1. de richting van de drempel — één beoordeelde meting is genoeg, want een
//      echte brand niet markeren is de dure fout;
//   2. de onderbouwing — de getoonde signalen komen alleen van de metingen die
//      de drempel haalden, anders onderbouwt de tekst iets anders dan het
//      oordeel erboven.

import assert from "node:assert/strict";
import { vatBeoordelingSamen, type BeoordeeldeMeting } from "../lib/rookbeoordeling.ts";

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

console.log("Beoordeling van een rookcluster:");

test("een leeg cluster levert geen oordeel", () => {
  const r = vatBeoordelingSamen([]);
  assert.equal(r.waarschijnlijkNatuurbrand, false);
  assert.equal(r.natuurbrandDetecties, 0);
  assert.deepEqual(r.signalen, []);
});

test("alleen niet-beoordeelde metingen leveren geen oordeel", () => {
  const r = vatBeoordelingSamen([meting(false, ["x"]), meting(false, ["y"])]);
  assert.equal(r.waarschijnlijkNatuurbrand, false);
  assert.equal(r.natuurbrandDetecties, 0);
});

test("één beoordeelde meting tussen negen andere is genoeg", () => {
  const metingen = [...Array(9)].map(() => meting(false));
  metingen.push(meting(true, ["hoge VIIRS-betrouwbaarheid"]));
  const r = vatBeoordelingSamen(metingen);
  assert.equal(r.waarschijnlijkNatuurbrand, true, "de drempel is bewust asymmetrisch");
  assert.equal(r.natuurbrandDetecties, 1);
});

test("de teller telt alleen beoordeelde metingen, niet alle metingen", () => {
  const r = vatBeoordelingSamen([meting(true), meting(false), meting(true), meting(false)]);
  assert.equal(r.natuurbrandDetecties, 2);
});

test("signalen van niet-beoordeelde metingen tellen niet mee", () => {
  const r = vatBeoordelingSamen([
    meting(true, ["sterk uitgestraald warmtevermogen"]),
    meting(false, ["deze reden mag nergens opduiken"]),
  ]);
  assert.deepEqual(r.signalen, ["sterk uitgestraald warmtevermogen"]);
});

test("dezelfde reden verschijnt één keer, niet per meting", () => {
  const r = vatBeoordelingSamen([
    meting(true, ["hoge VIIRS-betrouwbaarheid"]),
    meting(true, ["hoge VIIRS-betrouwbaarheid"]),
    meting(true, ["hoge VIIRS-betrouwbaarheid"]),
  ]);
  assert.deepEqual(r.signalen, ["hoge VIIRS-betrouwbaarheid"]);
  assert.equal(r.natuurbrandDetecties, 3);
});

test("de vaakst voorkomende reden staat vooraan", () => {
  const r = vatBeoordelingSamen([
    meting(true, ["zelden", "vaak"]),
    meting(true, ["vaak"]),
    meting(true, ["vaak"]),
  ]);
  assert.deepEqual(r.signalen, ["vaak", "zelden"]);
});

test("bij een gelijk aantal is de volgorde alfabetisch en dus herhaalbaar", () => {
  // De route cachet haar antwoord; dezelfde invoer moet altijd dezelfde uitvoer
  // geven, ook als de metingen in een andere volgorde binnenkomen.
  const eerste = vatBeoordelingSamen([meting(true, ["beta"]), meting(true, ["alfa"])]);
  const tweede = vatBeoordelingSamen([meting(true, ["alfa"]), meting(true, ["beta"])]);
  assert.deepEqual(eerste.signalen, ["alfa", "beta"]);
  assert.deepEqual(eerste.signalen, tweede.signalen);
});

test("een beoordeelde meting zonder redenen levert wél een oordeel", () => {
  // Het oordeel hangt aan de vlag, niet aan de aanwezigheid van tekst; de
  // detailregel moet dan gewoon zonder signalenzin kunnen renderen.
  const r = vatBeoordelingSamen([meting(true, [])]);
  assert.equal(r.waarschijnlijkNatuurbrand, true);
  assert.deepEqual(r.signalen, []);
});

console.log(`\n✓ ${geslaagd}/${geslaagd} tests geslaagd — clusterbeoordeling werkt.`);
