// Offline zelftest voor de versheidsgrenzen (lib/nieuws-vers.ts). Geen netwerk.
// Draaien:  node --experimental-strip-types scripts/test-nieuws-vers.ts
//
// Bewijst dat (1) de begroting van de cachevensters onder het uur blijft dat de
// zijlade als bovengrens hanteert, en (2) `teOud` een ontbrekend of onleesbaar
// tijdstip als te oud behandelt in plaats van als vers.

import assert from "node:assert/strict";
import {
  CLIENT_VERVERS_MS,
  FEED_REVALIDATE_S,
  MAX_LEEFTIJD_MS,
  NIEUWS_CDN_MAXAGE_S,
  NIEUWS_CDN_SWR_S,
  leeftijdMs,
  teOud,
} from "../lib/nieuws-vers.ts";

let geslaagd = 0;
function check(voorwaarde: boolean, bericht: string) {
  assert.ok(voorwaarde, bericht);
  geslaagd += 1;
}

const NU = Date.UTC(2026, 7, 26, 12, 0, 0); // 26-08-2026 12:00, vast
const minuten = (n: number) => new Date(NU - n * 60 * 1000).toISOString();

// --- 1. De begroting: wat kan een bezoeker maximaal aan ouderdom zien? ------
// CDN-venster (vers + stale) plus de leeftijd van de feedgegevens erachter.
const CDN_VENSTER_S = NIEUWS_CDN_MAXAGE_S + NIEUWS_CDN_SWR_S;
const SLECHTSTE_GEVAL_S = CDN_VENSTER_S + FEED_REVALIDATE_S;

check(
  CDN_VENSTER_S * 1000 < MAX_LEEFTIJD_MS,
  "het CDN-venster alleen moet ruim binnen de bovengrens van een uur vallen"
);
check(
  SLECHTSTE_GEVAL_S * 1000 < MAX_LEEFTIJD_MS,
  `slechtste geval (${SLECHTSTE_GEVAL_S} s) moet onder de bovengrens (${
    MAX_LEEFTIJD_MS / 1000
  } s) blijven`
);
check(
  CLIENT_VERVERS_MS < MAX_LEEFTIJD_MS,
  "de client moet vaker verversen dan de bovengrens, anders veroudert hij zichzelf"
);
check(
  MAX_LEEFTIJD_MS === 60 * 60 * 1000,
  "de bovengrens is een uur, zoals afgesproken"
);

// --- 2. leeftijdMs ----------------------------------------------------------
check(leeftijdMs(minuten(10), NU) === 10 * 60 * 1000, "tien minuten oud");
check(leeftijdMs(null, NU) === null, "ontbrekend tijdstip geeft null");
check(leeftijdMs("geen datum", NU) === null, "onleesbaar tijdstip geeft null");

// --- 3. teOud ---------------------------------------------------------------
check(teOud(minuten(5), NU) === false, "vijf minuten oud is niet te oud");
check(teOud(minuten(59), NU) === false, "59 minuten oud is nog net niet te oud");
check(teOud(minuten(61), NU) === true, "61 minuten oud is te oud");
check(
  teOud(minuten(60 * 24 * 25), NU) === true,
  "de stand van 1 augustus op 26 augustus moet als te oud gelden"
);

// Onbekende ouderdom telt als te oud: liever een eerlijke melding dan een stand
// waarvan we niet weten hoe oud hij is.
check(teOud(null, NU) === true, "ontbrekend tijdstip telt als te oud");
check(teOud(undefined, NU) === true, "afwezig tijdstip telt als te oud");
check(teOud("", NU) === true, "leeg tijdstip telt als te oud");
check(teOud("niet-een-datum", NU) === true, "onleesbaar tijdstip telt als te oud");

console.log(`✓ alle ${geslaagd} versheid-tests geslaagd`);
