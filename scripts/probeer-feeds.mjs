// Zoekt uit welke feed-URL's in data/nieuwsbronnen.ts werkelijk werken, en
// probeert voor de kapotte een werkend adres te VINDEN in plaats van te raden.
//
// Draaien: via GitHub → Actions → "Feedcontrole" → Run workflow.
// Of lokaal:  node scripts/probeer-feeds.mjs [filter]
//
// WAAROM. Op 26-08-2026 stond 9 van de 13 bronnen op "mislukt". Feed-URL's raden
// is verboden (zie de kop van data/nieuwsbronnen.ts: "Verzin geen bronnen"), dus
// dit script raadt niet — het TEST. Twee wegen naar een kandidaat:
//   1. de site zelf vragen: <link rel="alternate" type="application/rss+xml">;
//   2. de gebruikelijke feed-paden proberen (/rss, /feed, /rss.xml, …).
// Een kandidaat komt alleen in de uitslag als hij aantoonbaar een feed mét items
// teruggeeft. Een geteste kandidaat is dus geen gok maar een meting.
//
// WAT DE VORIGE VERSIE FOUT DEED (26-08-2026). Als de pagina waarop het script
// naar feeds zocht zelf niet laadde, sloeg het die stil over en meldde daarna
// "geen feed aangekondigd op de site". Dat is een conclusie die nooit is
// vastgesteld: elf bronnen kregen dat etiket terwijl in werkelijkheid de
// pagina-aanvraag was geweigerd. Deze versie meldt per stap wát er misging, en
// zegt nooit "geen feed" als hij niet heeft kunnen kijken.

import {
  conventioneleKandidaten,
  eindOordeel,
  isFeedDocument,
  nieuwsteDatum,
  ontdekkingsOordeel,
  telItems,
  vindAangekondigdeFeeds,
} from "../lib/feedcontrole-logica.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HIER = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 12000;
const PAUZE_MS = 250; // beleefdheid: niet roffelen op dezelfde host

// Twee user-agents, met opzet.
//   TOOL_UA  — precies wat app/api/nieuws/route.ts zelf stuurt. Faalt een feed
//              hiermee maar lukt hij met de andere, dan ligt het aan de UA en
//              moet de route mee veranderen, niet het adres.
//   NETTE_UA — dezelfde identiteit in de vorm die naïeve UA-filters accepteren:
//              een Mozilla-token plus wie we zijn en waarom. Geen vermomming;
//              de bron en het doel staan er gewoon in.
const TOOL_UA = "Infofrankrijk-Bosbranden/1.0";
const NETTE_UA =
  "Mozilla/5.0 (compatible; Infofrankrijk-Bosbranden/1.0; +https://www.nederlanders.fr/page/bosbranden)";

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";
const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";

const filter = (process.argv[2] ?? "").toLowerCase();

// De bronnenlijst is TypeScript; we lezen hem als tekst en vissen er de naam- en
// url-paren uit. Zo hoeft dit script niets te compileren.
function leesBronnen() {
  const tekst = readFileSync(join(HIER, "..", "data", "nieuwsbronnen.ts"), "utf8");
  const bronnen = [];
  for (const blok of tekst.split(/\{\s*\n/).slice(1)) {
    const naam = blok.match(/naam:\s*"([^"]+)"/)?.[1];
    const url = blok.match(/url:\s*"([^"]+)"/)?.[1];
    const actief = /actief:\s*true/.test(blok);
    if (naam && url) bronnen.push({ naam, url, actief });
  }
  return bronnen;
}

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

async function haal(url, accept, ua) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua, Accept: accept },
      signal: controller.signal,
      redirect: "follow",
    });
    const tekst = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      type: res.headers.get("content-type") ?? "",
      tekst,
      url: res.url,
      reden: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (fout) {
    const reden = fout.name === "AbortError" ? `time-out na ${TIMEOUT_MS / 1000} s` : fout.message;
    return { ok: false, status: 0, type: "", tekst: "", url, reden };
  } finally {
    clearTimeout(timer);
    await wacht(PAUZE_MS);
  }
}

// Beschrijft in één regel wat er op een adres staat als het géén feed is.
function watStaatEr(res) {
  const kop = res.tekst.slice(0, 400).replace(/\s+/g, " ").trim();
  if (/<html/i.test(kop) || /html/i.test(res.type)) return "HTML-pagina, geen feed";
  if (!kop) return `leeg antwoord (${res.type || "geen content-type"})`;
  return `geen <item>/<entry> (${res.type || "geen content-type"}) — begin: "${kop.slice(0, 120)}…"`;
}

// Beoordeelt één feed-adres. Probeert eerst de UA die de tool zelf gebruikt en
// pas daarna de nette variant, zodat een UA-blokkade als zodanig zichtbaar wordt.
async function beoordeelFeed(url) {
  const eerste = await haal(url, FEED_ACCEPT, TOOL_UA);

  if (eerste.ok && telItems(eerste.tekst) > 0) {
    return { oordeel: "WERKT", detail: beschrijfFeed(eerste), aantal: telItems(eerste.tekst) };
  }

  const tweede = await haal(url, FEED_ACCEPT, NETTE_UA);

  if (tweede.ok && telItems(tweede.tekst) > 0) {
    const aantal = telItems(tweede.tekst);
    if (!eerste.ok) {
      return {
        oordeel: "WERKT (andere UA nodig)",
        detail: `${beschrijfFeed(tweede)} — met de UA van de tool: ${eerste.reden}`,
        aantal,
        uaProbleem: true,
      };
    }
    return { oordeel: "WERKT", detail: beschrijfFeed(tweede), aantal };
  }

  // Geen van beide leverde items. Bestaat het adres wel?
  const bereikbaar = eerste.ok || tweede.ok;
  if (bereikbaar) {
    const res = eerste.ok ? eerste : tweede;
    if (isFeedDocument(res.tekst)) {
      return {
        oordeel: "LEEG",
        detail: "geldige feed, op dit moment zonder items — adres is in orde",
        aantal: 0,
      };
    }
    return { oordeel: "GEEN FEED", detail: watStaatEr(res), aantal: 0 };
  }
  const detail =
    eerste.reden === tweede.reden
      ? eerste.reden
      : `${eerste.reden} (UA van de tool) / ${tweede.reden} (nette UA)`;
  return { oordeel: "MISLUKT", detail, aantal: 0 };
}

function beschrijfFeed(res) {
  const aantal = telItems(res.tekst);
  const nieuwste = nieuwsteDatum(res.tekst);
  if (!nieuwste) return `${aantal} items, geen datums`;
  const dagen = Math.round((Date.now() - Date.parse(nieuwste)) / 86400000);
  return `${aantal} items, nieuwste ${nieuwste.slice(0, 10)} (${dagen} dagen oud)`;
}

const bronnen = leesBronnen().filter((b) => !filter || b.naam.toLowerCase().includes(filter));
console.log(`Feedcontrole — ${bronnen.length} bron(nen)\n${"=".repeat(64)}\n`);

const uitslagen = [];

for (const bron of bronnen) {
  console.log(`${bron.naam}${bron.actief ? "" : "   (staat uit)"}`);
  console.log(`  ingesteld: ${bron.url}`);
  const eerste = await beoordeelFeed(bron.url);
  console.log(`  → ${eerste.oordeel}: ${eerste.detail}`);

  if (eerste.oordeel.startsWith("WERKT") || eerste.oordeel === "LEEG") {
    uitslagen.push({
      naam: bron.naam,
      status: bron.actief ? "in orde" : "werkt weer",
      vervanger: null,
      uaProbleem: !!eerste.uaProbleem,
      actief: bron.actief,
    });
    console.log("");
    continue;
  }

  // ---- Weg 1: de site zelf vragen ----
  const gevonden = new Set();
  const paginaFouten = [];
  let paginaGelezen = 0;
  let bases = [];
  try {
    const u = new URL(bron.url);
    bases = [...new Set([new URL(".", u).toString(), u.origin + "/"])];
  } catch {
    /* onbruikbare URL */
  }
  for (const pagina of bases) {
    const html = await haal(pagina, HTML_ACCEPT, NETTE_UA);
    if (!html.ok) {
      paginaFouten.push(`${pagina} → ${html.reden}`);
      continue;
    }
    paginaGelezen += 1;
    for (const feed of vindAangekondigdeFeeds(html.tekst, html.url)) gevonden.add(feed);
  }

  const ontdekking = ontdekkingsOordeel(paginaGelezen, gevonden.size);
  if (ontdekking === "onbeslist") {
    // NIET zeggen "geen feed aangekondigd": we hebben niet kunnen kijken.
    console.log("  site niet te lezen, dus niet vast te stellen of er een feed wordt aangekondigd:");
    for (const f of paginaFouten) console.log(`    ${f}`);
  } else if (ontdekking === "geen-aankondiging") {
    console.log(`  site gelezen (${paginaGelezen} pagina's): geen feed aangekondigd in de HTML`);
  } else {
    console.log(`  site kondigt ${gevonden.size} feed(s) aan`);
  }

  // ---- Weg 2: de gebruikelijke paden ----
  for (const k of conventioneleKandidaten(bron.url)) gevonden.add(k);

  let beste = null;
  for (const kandidaat of gevonden) {
    const oordeel = await beoordeelFeed(kandidaat);
    // Alleen tonen wat iets oplevert; anders wordt de uitslag onleesbaar.
    if (!oordeel.oordeel.startsWith("WERKT")) continue;
    console.log(`  kandidaat: ${kandidaat}`);
    console.log(`    → ${oordeel.oordeel}: ${oordeel.detail}`);
    if (!beste || oordeel.aantal > beste.aantal) {
      beste = { url: kandidaat, aantal: oordeel.aantal, uaProbleem: !!oordeel.uaProbleem };
    }
  }

  if (!beste) {
    const status = ontdekking === "onbeslist" ? "onbeslist" : "niets gevonden";
    console.log(`  geen enkele kandidaat leverde een feed (${gevonden.size} geprobeerd)`);
    uitslagen.push({ naam: bron.naam, status, vervanger: null, uaProbleem: false, actief: bron.actief });
  } else {
    uitslagen.push({
      naam: bron.naam,
      status: "vervanger",
      vervanger: beste,
      uaProbleem: beste.uaProbleem,
      actief: bron.actief,
    });
  }
  console.log("");
}

console.log("=".repeat(64));
console.log("Samenvatting\n");

const inOrde = uitslagen.filter((u) => u.status === "in orde");
const werktWeer = uitslagen.filter((u) => u.status === "werkt weer");
const vervangers = uitslagen.filter((u) => u.status === "vervanger");
const nietsGevonden = uitslagen.filter((u) => u.status === "niets gevonden");
const onbeslist = uitslagen.filter((u) => u.status === "onbeslist");

console.log(`  in orde: ${inOrde.length} · werkt weer: ${werktWeer.length} · ` +
  `nieuw adres: ${vervangers.length} · niets gevonden: ${nietsGevonden.length} · ` +
  `onbeslist: ${onbeslist.length}\n`);

if (werktWeer.length) {
  console.log("STOND UIT MAAR WERKT WEER — zet actief: true in data/nieuwsbronnen.ts:");
  for (const r of werktWeer) console.log(`  ${r.naam}`);
  console.log("");
}

if (vervangers.length) {
  console.log("OVER TE NEMEN in data/nieuwsbronnen.ts (getest, werkt):");
  for (const r of vervangers) {
    console.log(`  ${r.naam}`);
    console.log(`      url: "${r.vervanger.url}",`);
    console.log(`      bevestigd: true,`);
    if (!r.actief) console.log(`      actief: true,`);
    console.log(`      // controleer of dit dezelfde bron is als hierboven bedoeld:`);
    console.log(`      // een ander pad kan een andere sectie of zelfs de landelijke feed zijn.`);
    if (r.uaProbleem) {
      console.log(`      // LET OP: werkt niet met de user-agent die de route stuurt.`);
    }
  }
  console.log("");
}
if (nietsGevonden.length) {
  console.log("SITE GELEZEN, GEEN WERKENDE FEED — kandidaat voor actief: false:");
  console.log("(staat er al 'staat uit' bij, dan is er niets te doen)");
  for (const r of nietsGevonden) console.log(`  ${r.naam}`);
  console.log("");
}
if (onbeslist.length) {
  console.log("ONBESLIST — de site liet ons niet kijken. NIET uitzetten op grond hiervan;");
  console.log("dit zegt niets over de bron, alleen dat de controle geen antwoord kreeg:");
  for (const r of onbeslist) console.log(`  ${r.naam}`);
  console.log("");
}
if (inOrde.some((u) => u.uaProbleem)) {
  console.log("UA-PROBLEEM — feed werkt alleen met de nette user-agent, niet met die van");
  console.log("de route. Pas de User-Agent aan in app/api/nieuws/route.ts:");
  for (const r of inOrde.filter((u) => u.uaProbleem)) console.log(`  ${r.naam}`);
  console.log("");
}

// ---- Uitkomst als exitcode, voor de wekelijkse bewaking --------------------
// Een ACTIEVE bron waarvan het ingestelde adres het niet meer doet, is een
// storing: dan staat de lade stil zonder dat iemand het merkt. Die laat het
// script falen, zodat GitHub de eigenaar vanzelf een melding stuurt. Uitgezette
// bronnen tellen niet mee (die weten we al), en "onbeslist" evenmin: dat zegt
// niets over de bron, alleen dat de controlemachine geen antwoord kreeg.
const { storingen, nietTeZeggen } = eindOordeel(uitslagen);

if (nietTeZeggen.length) {
  console.log(`Let op: ${nietTeZeggen.length} actieve bron(nen) konden niet worden gecontroleerd.`);
}

if (storingen.length) {
  console.log(`STORING: ${storingen.length} actieve bron(nen) leveren geen feed meer.`);
  for (const r of storingen) console.log(`  ${r.naam}`);
  console.log("");
  console.log("De nieuwslade mist hierdoor materiaal. Zie hierboven of er een nieuw");
  console.log("adres is gevonden; zo niet, zet de bron op actief: false.");
  process.exitCode = 1;
} else {
  console.log("Alle actieve bronnen leveren een feed.");
}
