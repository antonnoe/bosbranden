// Offline zelftest voor de beslislogica van de feedcontrole. Geen netwerk.
// Draaien:  node --experimental-strip-types scripts/test-feedcontrole.ts
//
// WAAROM DEZE TEST BESTAAT. De feedcontrole stuurde op 26-08-2026 een uitslag
// de deur uit waarin elf bronnen "geen feed aangekondigd op de site" kregen,
// terwijl het script die sites nooit had kunnen lezen. Er was bijna op afgegaan
// door elf werkende bronnen uit te zetten. Een meetinstrument dat verkeerd
// rapporteert is erger dan geen meetinstrument, dus elk oordeel dat het velt
// staat hieronder — met nadruk op de gevallen waarin het NIETS mag concluderen.

import assert from "node:assert/strict";
import {
  conventioneleKandidaten,
  eindOordeel,
  isFeedDocument,
  nieuwsteDatum,
  ontdekkingsOordeel,
  telItems,
  vindAangekondigdeFeeds,
} from "../lib/feedcontrole-logica.mjs";

let geslaagd = 0;
function check(voorwaarde: boolean, bericht: string) {
  assert.ok(voorwaarde, bericht);
  geslaagd += 1;
}

// --- 1. ontdekkingsOordeel — de fout die dit alles veroorzaakte -------------
check(
  ontdekkingsOordeel(0, 0) === "onbeslist",
  "geen pagina gelezen → ONBESLIST, nooit 'geen feed aangekondigd'"
);
check(
  ontdekkingsOordeel(1, 0) === "geen-aankondiging",
  "pagina gelezen en niets gevonden → dat mag wél zo heten"
);
check(ontdekkingsOordeel(2, 3) === "aangekondigd", "feeds gevonden → aangekondigd");
// De kern: nul gelezen pagina's mag nooit tot een uitspraak over de bron leiden,
// hoeveel kandidaten er verder ook zijn geprobeerd.
check(
  ontdekkingsOordeel(0, 5) === "onbeslist",
  "zonder gelezen pagina blijft het onbeslist, ook als er kandidaten waren"
);

// --- 2. eindOordeel — wat de wekelijkse bewaking alarm laat slaan -----------
const uitslagen = [
  { naam: "werkt", actief: true, status: "in orde" },
  { naam: "leeg maar geldig", actief: true, status: "in orde" },
  { naam: "kapot", actief: true, status: "niets gevonden" },
  { naam: "verhuisd", actief: true, status: "vervanger" },
  { naam: "niet te controleren", actief: true, status: "onbeslist" },
  { naam: "staat uit en is kapot", actief: false, status: "niets gevonden" },
  { naam: "staat uit en werkt weer", actief: false, status: "werkt weer" },
];
const { storingen, nietTeZeggen } = eindOordeel(uitslagen);
check(storingen.length === 2, "alleen de kapotte en de verhuisde actieve bron zijn storingen");
check(
  storingen.every((s: { actief: boolean }) => s.actief),
  "een uitgezette bron mag nooit alarm slaan — dat weten we al"
);
check(
  !storingen.some((s: { status: string }) => s.status === "onbeslist"),
  "onbeslist is geen storing: het zegt niets over de bron"
);
check(nietTeZeggen.length === 1, "onbeslist wordt apart geteld, niet weggemoffeld");
check(eindOordeel([]).storingen.length === 0, "lege lijst geeft geen storingen");

// --- 3. isFeedDocument — een lege feed is geen kapot adres -----------------
// Atmo Nouvelle-Aquitaine geeft dit terug: geldige RSS, nul items. Zou dat als
// storing tellen, dan sloeg de wekelijkse controle elke week vals alarm.
check(
  isFeedDocument('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'),
  "lege maar geldige RSS is een feed-document"
);
check(
  isFeedDocument('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'),
  "lege maar geldige Atom is een feed-document"
);
check(
  isFeedDocument('<rdf:RDF xmlns="http://purl.org/rss/1.0/"></rdf:RDF>'),
  "RSS 1.0 (RDF) telt ook"
);
check(
  !isFeedDocument("<!DOCTYPE html><html><head><title>Pagina</title></head></html>"),
  "een HTML-pagina is geen feed-document"
);
check(!isFeedDocument(""), "leeg antwoord is geen feed-document");

// --- 4. telItems ------------------------------------------------------------
check(telItems("<item>a</item><item>b</item>") === 2, "RSS-items tellen");
check(telItems("<entry>a</entry>") === 1, "Atom-entries tellen");
check(telItems('<item rdf:about="x">a</item>') === 1, "item met attributen telt mee");
check(telItems("<items>geen item</items>") === 0, "<items> is geen <item>");
check(telItems("") === 0, "leeg document telt nul");

// --- 5. nieuwsteDatum -------------------------------------------------------
check(
  nieuwsteDatum("<pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate><pubDate>Wed, 26 Aug 2026 10:00:00 GMT</pubDate>")
    ?.slice(0, 10) === "2026-08-26",
  "de nieuwste van meerdere datums wint"
);
// Le Parisien leverde 100 items zonder datums. De datumpoort weigert die
// allemaal, dus zo'n feed is waardeloos — dat moet zichtbaar zijn.
check(
  nieuwsteDatum("<item><title>Zonder datum</title></item>") === null,
  "een feed zonder datums levert null, niet een verzonnen datum"
);
check(nieuwsteDatum("<pubDate>geen datum</pubDate>") === null, "onleesbare datum telt niet mee");

// --- 6. vindAangekondigdeFeeds ---------------------------------------------
const html = `<html><head>
  <link rel="alternate" type="application/rss+xml" href="/nieuws/rss.xml">
  <link rel="alternate" type="application/atom+xml" href="https://elders.fr/atom">
  <link rel="stylesheet" href="/stijl.css">
  <link rel="alternate" type="text/html" href="/amp">
</head></html>`;
const gevonden = vindAangekondigdeFeeds(html, "https://voorbeeld.fr/sectie/");
check(gevonden.length === 2, "alleen RSS- en Atom-aankondigingen tellen");
check(
  gevonden.includes("https://voorbeeld.fr/nieuws/rss.xml"),
  "een relatief adres wordt absoluut gemaakt"
);
check(gevonden.includes("https://elders.fr/atom"), "een absoluut adres blijft staan");
check(vindAangekondigdeFeeds("", "https://voorbeeld.fr/") .length === 0, "lege HTML geeft niets");

// --- 7. conventioneleKandidaten --------------------------------------------
const kandidaten = conventioneleKandidaten("https://www.voorbeeld.fr/gironde/rss");
check(
  kandidaten.includes("https://www.voorbeeld.fr/gironde/rss.xml"),
  "de map van het ingestelde adres wordt beproefd"
);
check(
  kandidaten.includes("https://www.voorbeeld.fr/rss.xml"),
  "de hoofdmap van het domein wordt óók beproefd"
);
check(
  !kandidaten.includes("https://www.voorbeeld.fr/gironde/rss"),
  "het ingestelde adres zelf staat niet nog eens in de kandidaten"
);
check(conventioneleKandidaten("geen url").length === 0, "een onbruikbaar adres geeft geen kandidaten");
// France 3 was alleen verhuisd van /rss.xml naar /rss; dat pad moet erbij zitten.
check(
  conventioneleKandidaten("https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/rss.xml")
    .includes("https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/rss"),
  "de verhuizing van /rss.xml naar /rss moet vindbaar zijn"
);

console.log(`✓ alle ${geslaagd} feedcontrole-tests geslaagd`);
