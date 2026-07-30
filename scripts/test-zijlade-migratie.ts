// Offline zelftest voor de zijlade-migratie. Geen netwerk, geen DOM nodig.
// Draaien:  node --experimental-strip-types scripts/test-zijlade-migratie.ts
//
// Bewijst dat de bewaarde sessionStorage-stand ("bosbranden-zijkolom") na de
// samenvoeging van Duiding/Verantwoording/Infographics tot één "uitleg"-paneel
// niet breekt: oude paneelwaarden mappen op "uitleg", de juiste interne tab
// wordt hersteld, en onbekende/lege/dichte waarden houden de lade dicht.
// Exit-code 1 bij een gefaalde assertie.

import assert from "node:assert/strict";
import {
  migreerPaneelSleutel,
  beginUitlegTab,
} from "../lib/zijlade-migratie.ts";

let geslaagd = 0;
function test(naam: string, uitvoeren: () => void) {
  uitvoeren();
  geslaagd += 1;
  console.log(`  ✓ ${naam}`);
}

console.log("sessionStorage-migratie zijlade:");

// --- Migratie van oude/actuele paneelwaarden naar "uitleg" ----------------
test('oude waarde "duiding" → uitleg', () =>
  assert.equal(migreerPaneelSleutel("duiding"), "uitleg"));
test('oude waarde "verantwoording" → uitleg', () =>
  assert.equal(migreerPaneelSleutel("verantwoording"), "uitleg"));
test('oude waarde "infographics" → uitleg', () =>
  assert.equal(migreerPaneelSleutel("infographics"), "uitleg"));
test('nieuwe interne waarde "bronnen" → uitleg', () =>
  assert.equal(migreerPaneelSleutel("bronnen"), "uitleg"));

// --- Bestaande/actuele waarden blijven werken -----------------------------
test('"nieuws" blijft nieuws', () =>
  assert.equal(migreerPaneelSleutel("nieuws"), "nieuws"));
test('waarde "uitleg" blijft uitleg', () =>
  assert.equal(migreerPaneelSleutel("uitleg"), "uitleg"));

// --- Dicht / onbekend / null → lade blijft dicht (null) -------------------
test('"dicht"-schildwacht → null', () =>
  assert.equal(migreerPaneelSleutel("dicht"), null));
test("null → null", () => assert.equal(migreerPaneelSleutel(null), null));
test("onbekende waarde → null", () =>
  assert.equal(migreerPaneelSleutel("verzonnen"), null));

// --- Herstel van de juiste interne tab (Bronnen is de standaardtab) -------
test('interne tab herstelt "infographics"', () =>
  assert.equal(beginUitlegTab("infographics"), "infographics"));
test('interne tab "duiding" blijft duiding', () =>
  assert.equal(beginUitlegTab("duiding"), "duiding"));
test('oude "verantwoording" valt terug op "bronnen" (tab opgegaan in Bronnen)', () =>
  assert.equal(beginUitlegTab("verantwoording"), "bronnen"));
test('onbekende/nieuwswaarde valt terug op "bronnen"', () =>
  assert.equal(beginUitlegTab("nieuws"), "bronnen"));

console.log(`\n✓ ${geslaagd}/13 tests geslaagd — zijlade-migratie werkt.`);
if (geslaagd !== 13) {
  console.error(`Verwacht 13 tests, maar ${geslaagd} uitgevoerd.`);
  process.exit(1);
}
