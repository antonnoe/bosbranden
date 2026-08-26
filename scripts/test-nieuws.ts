// Offline zelftest voor de nieuwsfilters. Geen netwerk nodig.
// Draaien:  node --experimental-strip-types scripts/test-nieuws.ts
//
// Bewijst met verzonnen items dat (1) een host buiten het bronnenbestand en
// (2) een item ouder dan 7 dagen allebei worden geweigerd, plus de trefwoord-
// en dubbelingcontrole. Exit-code 1 bij een gefaalde assertie.

import assert from "node:assert/strict";
import { ACTIEVE_BRONNEN, NIEUWSBRONNEN } from "../data/nieuwsbronnen.ts";
import {
  bepaalToestand,
  bouwAllowlist,
  hostToegestaan,
  binnenDatumpoort,
  filterBron,
  totaalGeweigerd,
  type RuwItem,
} from "../lib/nieuws-filter.ts";
import { kopDoorlaat } from "../lib/nieuws-thema.ts";

const allowlist = bouwAllowlist(ACTIEVE_BRONNEN);
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
// Subdomein-regel: de feed staat vaak op een ánder subdomein dan de artikelen
// (feeds.voorbeeld.fr levert links naar www.voorbeeld.fr). Getest met een eigen
// allowlist, niet met een bron uit het bestand: welke bronnen aan of uit staan
// verandert, deze regel niet.
const proefAllowlist = bouwAllowlist([
  {
    naam: "Proefbron",
    url: "https://feeds.voorbeeld.fr/sectie",
    soort: "pers",
    paywall: false,
    regio: "proef",
    bevestigd: false,
    actief: true,
  },
]);
assert.equal(
  hostToegestaan("https://www.voorbeeld.fr/artikel.php", proefAllowlist),
  true,
  "content-host moet matchen met de feed-host op hetzelfde registreerbare domein"
);
assert.equal(
  hostToegestaan("https://voorbeeld.fr.kwaadaardig.com/artikel.php", proefAllowlist),
  false,
  "een domein dat het toegestane domein alleen als tekst bevat, moet worden geweigerd"
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

const { items: uit, geweigerd, ruwAantal, naPoorten } = filterBron(ruw, bron, allowlist, NU);
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

// --- 5. Tellingen voor de bronstatus ---------------------------------------
assert.equal(ruwAantal, 6, "de feed bevatte zes items");
assert.equal(naPoorten, 4, "vier items haalden host-allowlist én datumpoort");

// --- 6. Actieve bronnen ------------------------------------------------------
// Een uitgezette bron mag niet worden opgehaald én mag geen domein openhouden:
// de allowlist wordt uit dezelfde verzameling opgebouwd als de ophaallijst.
assert.ok(ACTIEVE_BRONNEN.length > 0, "er moet minstens één actieve bron zijn");
assert.ok(
  ACTIEVE_BRONNEN.every((b) => b.actief),
  "ACTIEVE_BRONNEN mag alleen bronnen met actief: true bevatten"
);
assert.ok(
  NIEUWSBRONNEN.every((b) => b.actief || !b.bevestigd || b.naam.includes("Atmo")),
  "een uitgezette bron hoort niet als bevestigd te blijven staan (Atmo is de gemotiveerde uitzondering)"
);
// Le Parisien staat uit; zijn domein mag daarom niet meer in de allowlist zitten.
assert.equal(
  hostToegestaan("https://www.leparisien.fr/seine-et-marne/artikel.php", allowlist),
  false,
  "domein van een uitgezette bron mag niet meer worden toegelaten"
);
// France 3 staat wél aan, met het herstelde adres.
assert.equal(
  hostToegestaan("https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/incendie.html", allowlist),
  true,
  "domein van een actieve bron moet worden toegelaten"
);

// --- 7. bepaalToestand ------------------------------------------------------
// "geslaagd" alléén verborg dat een URL wel bestaat maar geen feed teruggeeft.
assert.equal(
  bepaalToestand(false, 0, 0),
  "mislukt",
  "onbereikbaar → mislukt"
);
assert.equal(
  bepaalToestand(true, 0, 0),
  "geen-feed",
  "HTTP 200 zonder items → geen feed op dit adres, niet 'geslaagd'"
);
assert.equal(
  bepaalToestand(true, 20, 0),
  "niets-recents",
  "feed met items maar niets binnen de datumpoort → niets recents"
);
assert.equal(
  bepaalToestand(true, 20, 5),
  "geslaagd",
  "feed met recente items → geslaagd"
);

console.log("✓ alle 33 nieuwsfilter-tests geslaagd");
