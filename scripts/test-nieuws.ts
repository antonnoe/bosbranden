// Offline zelftest voor de nieuwsfilters. Geen netwerk nodig.
// Draaien:  node --experimental-strip-types scripts/test-nieuws.ts
//
// Bewijst met verzonnen items dat (1) een host buiten het bronnenbestand en
// (2) een item ouder dan 7 dagen allebei worden geweigerd, plus de trefwoord-
// en dubbelingcontrole. Exit-code 1 bij een gefaalde assertie.

import assert from "node:assert/strict";
import { NIEUWSBRONNEN } from "../data/nieuwsbronnen.ts";
import {
  bouwAllowlist,
  hostToegestaan,
  binnenDatumpoort,
  filterBron,
  totaalGeweigerd,
  type RuwItem,
} from "../lib/nieuws-filter.ts";
import { kopDoorlaat } from "../lib/nieuws-thema.ts";

const allowlist = bouwAllowlist(NIEUWSBRONNEN);
const NU = Date.UTC(2026, 6, 27, 9, 0, 0); // 27-07-2026 (vast, tijdloze test)
const dagen = (n: number) => new Date(NU - n * 24 * 60 * 60 * 1000).toISOString();

// --- 1. Host-allowlist ------------------------------------------------------
assert.equal(
  hostToegestaan("https://www.sudouest.fr/gironde/incendie-123.php", allowlist),
  true,
  "host in bestand (sudouest.fr) moet worden toegestaan"
);
assert.equal(
  hostToegestaan("https://news.google.com/articles/xyz", allowlist),
  false,
  "aggregator-host buiten bestand (news.google.com) moet worden geweigerd"
);
assert.equal(
  hostToegestaan("https://leparisien.fr/seine-et-marne/feu.php", allowlist),
  true,
  "content-host leparisien.fr moet matchen met feed-host feeds.leparisien.fr"
);

// --- 2. Datumpoort ----------------------------------------------------------
assert.equal(binnenDatumpoort(dagen(1), NU), true, "1 dag oud → binnen poort");
assert.equal(binnenDatumpoort(dagen(6.5), NU), true, "6,5 dag oud → binnen poort");
assert.equal(binnenDatumpoort(dagen(8), NU), false, "8 dagen oud → geweigerd");
assert.equal(binnenDatumpoort(null, NU), false, "geen datum → geweigerd");

// --- 3. Onderwerpzeef (vervangt het oude losse trefwoordfilter) --------------
// De diepe tests staan in scripts/test-nieuws-thema.ts; hier alleen dat
// filterBron de zeef werkelijk aanroept.
assert.equal(kopDoorlaat("Incendie de forêt près de Bordeaux"), true);
assert.equal(kopDoorlaat("Évacuation de trois campings après un feu de végétation"), true);
assert.equal(kopDoorlaat("Nouveau rond-point inauguré à Mérignac"), false);
assert.equal(
  kopDoorlaat("Nîmes : deux voitures incendiées dans la nuit"),
  false,
  "het oude filter liet dit door op 'incendie'; de zeef moet het weigeren"
);

// --- 4. filterBron: geïntegreerde weigertest --------------------------------
const bron = NIEUWSBRONNEN.find((b) => b.naam.startsWith("Sud Ouest"))!;
const ruw: RuwItem[] = [
  // (a) geldig: juiste host, recent, trefwoord → BLIJFT
  {
    titel: "Incendie de forêt : évacuation en Gironde",
    url: "https://www.sudouest.fr/gironde/incendie-a.php",
    gepubliceerdOp: dagen(1),
  },
  // (b) host buiten bestand (ook al recent + trefwoord) → GEWEIGERD
  {
    titel: "Incendie de forêt majeur",
    url: "https://evil.example.com/incendie-b.php",
    gepubliceerdOp: dagen(1),
  },
  // (c) juiste host + trefwoord maar 10 dagen oud → GEWEIGERD (datumpoort)
  {
    titel: "Incendie de forêt à Landiras",
    url: "https://www.sudouest.fr/gironde/incendie-c.php",
    gepubliceerdOp: dagen(10),
  },
  // (d) juiste host + recent maar buiten het onderwerp → GEWEIGERD (zeef)
  {
    titel: "Un nouveau supermarché ouvre ses portes",
    url: "https://www.sudouest.fr/gironde/magasin-d.php",
    gepubliceerdOp: dagen(1),
  },
  // (e) juiste host + recent + het woord "incendie", maar een autobrand
  //     → GEWEIGERD (geen natuurcontext). Dit is het geval dat vóór de zeef
  //     gewoon in de lade belandde.
  {
    titel: "Nîmes : deux voitures incendiées sur un parking",
    url: "https://www.sudouest.fr/gard/voitures-e.php",
    gepubliceerdOp: dagen(1),
  },
  // (f) juiste host + recent + faits divers → GEWEIGERD (faits-divers-laag)
  {
    titel: "Monflanquin : une rixe éclate, les pompiers interviennent",
    url: "https://www.sudouest.fr/lot-et-garonne/rixe-f.php",
    gepubliceerdOp: dagen(1),
  },
];

const { items: uit, geweigerd } = filterBron(ruw, bron, allowlist, NU);
assert.equal(uit.length, 1, "alleen het geldige item mag overblijven");
assert.equal(uit[0].url, "https://www.sudouest.fr/gironde/incendie-a.php");
assert.ok(
  !uit.some((i) => i.url.includes("evil.example.com")),
  "item van host buiten het bestand mag NIET voorkomen"
);
assert.ok(
  !uit.some((i) => i.url.includes("incendie-c")),
  "item ouder dan 7 dagen mag NIET voorkomen"
);
assert.equal(uit[0].bron, bron.naam);
assert.equal(uit[0].soort, "pers");
assert.equal(uit[0].paywall, true);

// De telling gaat alleen over items die host- en datumpoort al haalden: (d),
// (e) en (f). Item (b) sneuvelde op de host, (c) op de datum.
assert.equal(totaalGeweigerd(geweigerd), 3, "drie items moeten door de zeef zijn geweigerd");
assert.equal(geweigerd.geenOnderwerp, 2, "(d) en (e) vallen op 'geen onderwerp'");
assert.equal(geweigerd.faitsDivers, 1, "(f) valt op de faits-divers-laag");

console.log("✓ alle 21 nieuwsfilter-tests geslaagd");
