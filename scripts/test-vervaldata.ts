// Offline zelftest voor het uitlezen van sleutel-vervaldata. Geen netwerk.
// Draaien:  node --experimental-strip-types scripts/test-vervaldata.ts
//
// WAAROM DEZE TEST BESTAAT. Twee redenen, en de tweede is de belangrijkste.
//
//   1. De uitkomst stuurt een alarm aan. Een verkeerd gelezen datum betekent
//      ofwel vals alarm, ofwel geen alarm terwijl de sleutel verloopt en de
//      hele Météo-France-koppeling stilvalt. "Onbekend" mag daarbij nooit als
//      "nog lang goed" worden gelezen: dat is de stille variant van de fout.
//
//   2. De uitvoer belandt in een publiek endpoint en in de logs van een
//      monitor. Een sleutel die daar per ongeluk in terechtkomt, is niet meer
//      terug te halen. Daarom staat hieronder expliciet dat geen enkel veld
//      ook maar een fragment van de sleutel bevat, in élk van de gevallen:
//      geldig, geen JWT, onleesbaar, en zonder exp.

import assert from "node:assert/strict";
import { dagenTot, leesVervaldatum } from "../lib/sleutel-vervaldatum.ts";
import { ABONNEMENTEN } from "../data/vervaldata.ts";

let geslaagd = 0;
function check(voorwaarde: boolean, bericht: string) {
  assert.ok(voorwaarde, bericht);
  geslaagd += 1;
}

// Bouwt een JWT met een herkenbaar geheim erin, zodat we kunnen bewijzen dat
// dat geheim nergens in de uitvoer opduikt.
const GEHEIM = "ditmagnooitnaarbuiten";
function b64(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
function maakJwt(payload: Record<string, unknown>): string {
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ ...payload, sub: GEHEIM })}.${GEHEIM}`;
}

const NU = new Date("2026-09-03T12:00:00Z");
const seconden = (d: Date) => Math.floor(d.getTime() / 1000);

// --- 1. Een gewone geldige sleutel -----------------------------------------
const over90 = new Date("2026-12-02T12:00:00Z");
const geldig = leesVervaldatum(
  maakJwt({ iat: seconden(new Date("2026-09-01T12:00:00Z")), exp: seconden(over90) })
);
check(geldig.verlooptOp === over90.toISOString(), "de exp-claim wordt als ISO-datum gelezen");
check(geldig.uitgegevenOp === "2026-09-01T12:00:00.000Z", "de iat-claim wordt gelezen");
check(geldig.opmerking === undefined, "een leesbare datum krijgt geen opmerking");
check(dagenTot(geldig.verlooptOp, NU) === 90, "negentig dagen tot de vervaldatum");

// Een sleutel met exp in milliseconden in plaats van seconden. Sommige
// uitgevers doen dat; zonder correctie zou de datum in het jaar 57000 vallen
// en zou een verlopen sleutel er eeuwig geldig uitzien.
const inMs = leesVervaldatum(maakJwt({ exp: over90.getTime() }));
check(inMs.verlooptOp === over90.toISOString(), "exp in milliseconden wordt herkend");

// --- 2. Een verlopen sleutel is negatief, niet onbekend ---------------------
const verlopen = leesVervaldatum(maakJwt({ exp: seconden(new Date("2026-08-20T12:00:00Z")) }));
check(dagenTot(verlopen.verlooptOp, NU) === -14, "een verlopen sleutel telt negatief door");

// --- 3. "Onbekend" is nooit "nog lang goed" --------------------------------
// Dit is de stille fout: een monitor die op een getal drempelt, mag bij een
// onleesbare sleutel geen groot getal krijgen. Null dwingt hem te alarmeren.
const geenJwt = leesVervaldatum("abc123opaque");
check(geenJwt.verlooptOp === null, "een opaque sleutel levert geen datum");
check(typeof geenJwt.opmerking === "string", "…maar wel een reden");
check(dagenTot(geenJwt.verlooptOp, NU) === null, "geen datum betekent null, geen groot getal");

const rommel = leesVervaldatum("een.tweedeel.driedeel");
check(rommel.verlooptOp === null, "drie delen die geen JSON zijn leveren geen datum");
check(typeof rommel.opmerking === "string", "…met een reden erbij");

const zonderExp = leesVervaldatum(maakJwt({ iat: seconden(NU) }));
check(zonderExp.verlooptOp === null, "zonder exp-claim geen datum");
check(
  zonderExp.opmerking?.includes("onbeperkt") === true,
  "…en de opmerking waarschuwt dat dit niet 'onbeperkt geldig' betekent"
);

const leeg = leesVervaldatum(undefined);
check(leeg.verlooptOp === null, "een ontbrekende variabele levert geen datum");
check(dagenTot(null, NU) === null, "dagenTot op null blijft null");

// --- 4. De sleutel lekt nergens uit ----------------------------------------
// Het geheim zit in de payload (sub) én in de handtekening van elke testsleutel
// hierboven. Als het in enig veld van enige uitkomst opduikt, staat het straks
// in een publieke response en in de logs van de monitor.
for (const [naam, uitkomst] of [
  ["geldig", geldig],
  ["in ms", inMs],
  ["verlopen", verlopen],
  ["geen jwt", geenJwt],
  ["rommel", rommel],
  ["zonder exp", zonderExp],
  ["leeg", leeg],
] as const) {
  check(
    !JSON.stringify(uitkomst).includes(GEHEIM),
    `geval "${naam}": geen enkel fragment van de sleutel komt in de uitvoer`
  );
}

// --- 5. Het configbestand is bruikbaar voor een alarm ----------------------
check(ABONNEMENTEN.length === 3, "drie abonnementen uit het portaal");
for (const a of ABONNEMENTEN) {
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(a.eindigtOp),
    `${a.naam}: einddatum in ISO-vorm, niet in het dd/mm/jjjj van het portaal`
  );
  check(dagenTot(a.eindigtOp, NU) !== null, `${a.naam}: de einddatum is te tellen`);
}
// Het portaal toont dd/mm/jjjj. Zou 10/07/2028 als oktober zijn overgenomen,
// dan zou Vigilance drie maanden te laat alarm slaan.
const vigilance = ABONNEMENTEN.find((a) => a.naam === "Vigilance Bulletin")!;
check(vigilance.eindigtOp === "2028-07-10", "Vigilance loopt tot juli 2028, niet oktober");
check(vigilance.limietPerMinuut === 60, "Vigilance heeft een lagere limiet dan de andere twee");

console.log(`OK — ${geslaagd} eigenschappen vastgelegd voor de vervaldata.`);
