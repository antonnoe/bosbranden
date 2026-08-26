// Zoekt uit welke feed-URL's in data/nieuwsbronnen.ts werkelijk werken, en
// probeert voor de kapotte een werkend adres te VINDEN in plaats van te raden.
//
// Draaien vanaf een machine mét netwerktoegang:
//   node scripts/probeer-feeds.mjs            # alle bronnen
//   node scripts/probeer-feeds.mjs gironde    # alleen bronnen die zo heten
//
// WAAROM. Op 26-08-2026 stond 9 van de 13 bronnen op "mislukt" en twee op
// "geslaagd" zonder ook maar één item. De zeef was toen niet meer het knelpunt;
// de bronnenlijst was dat. Feed-URL's raden is verboden (zie de kop van
// data/nieuwsbronnen.ts: "Verzin geen bronnen"), dus dit script raadt niet maar
// VRAAGT HET DE SITE ZELF: het leest de <link rel="alternate"> in de HTML van de
// bijbehorende pagina — dat is waar een site zijn eigen feeds aankondigt — en
// test elke gevonden kandidaat.
//
// De uitvoer is bedoeld om over te nemen in data/nieuwsbronnen.ts. Neem alleen
// een adres over dat hieronder "WERKT" scoort, en zet `bevestigd: true` er pas
// bij als je het met dit script hebt zien werken.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HIER = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 12000;
const UA = "Infofrankrijk-Bosbranden/1.0 (feedcontrole)";
const filter = (process.argv[2] ?? "").toLowerCase();

// De bronnenlijst is TypeScript; we lezen hem als tekst en vissen er de naam- en
// url-paren uit. Zo hoeft dit script niets te compileren.
function leesBronnen() {
  const tekst = readFileSync(join(HIER, "..", "data", "nieuwsbronnen.ts"), "utf8");
  const bronnen = [];
  const blokken = tekst.split(/\{\s*\n/).slice(1);
  for (const blok of blokken) {
    const naam = blok.match(/naam:\s*"([^"]+)"/)?.[1];
    const url = blok.match(/url:\s*"([^"]+)"/)?.[1];
    if (naam && url) bronnen.push({ naam, url });
  }
  return bronnen;
}

async function haal(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      signal: controller.signal,
      redirect: "follow",
    });
    const tekst = await res.text();
    return { ok: res.ok, status: res.status, type: res.headers.get("content-type") ?? "", tekst, url: res.url };
  } catch (fout) {
    return { ok: false, status: 0, type: "", tekst: "", url, fout: fout.message };
  } finally {
    clearTimeout(timer);
  }
}

// Zelfde telling als lib/nieuws-filter.ts: RSS <item> én Atom <entry>.
function telItems(xml) {
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].length;
  const entries = [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].length;
  return items + entries;
}

function nieuwsteDatum(xml) {
  const datums = [];
  for (const tag of ["pubDate", "published", "updated"]) {
    for (const m of xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))) {
      const t = Date.parse(m[1].trim());
      if (!Number.isNaN(t)) datums.push(t);
    }
  }
  if (!datums.length) return null;
  return new Date(Math.max(...datums)).toISOString();
}

// Waar kondigt de site zelf zijn feeds aan? <link rel="alternate" type="…rss…">
function vindAangekondigdeFeeds(html, basis) {
  const uit = new Set();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      uit.add(new URL(href, basis).toString());
    } catch {
      /* onbruikbare href overslaan */
    }
  }
  return [...uit];
}

async function beoordeel(url) {
  const res = await haal(url, "application/rss+xml, application/atom+xml, application/xml, text/xml");
  if (!res.ok) {
    return { oordeel: "MISLUKT", detail: res.fout ? res.fout : `HTTP ${res.status}`, aantal: 0 };
  }
  const aantal = telItems(res.tekst);
  if (aantal === 0) {
    const soort = /html/i.test(res.type) ? "HTML-pagina, geen feed" : `geen items (${res.type || "onbekend type"})`;
    return { oordeel: "GEEN FEED", detail: soort, aantal: 0 };
  }
  const nieuwste = nieuwsteDatum(res.tekst);
  const ouderdom = nieuwste ? Math.round((Date.now() - Date.parse(nieuwste)) / 86400000) : null;
  return {
    oordeel: "WERKT",
    detail: `${aantal} items` + (nieuwste ? `, nieuwste ${nieuwste.slice(0, 10)} (${ouderdom} dagen oud)` : ", geen datums"),
    aantal,
  };
}

const bronnen = leesBronnen().filter((b) => !filter || b.naam.toLowerCase().includes(filter));
console.log(`Feedcontrole — ${bronnen.length} bron(nen)\n${"=".repeat(60)}\n`);

const teVervangen = [];

for (const bron of bronnen) {
  console.log(`${bron.naam}`);
  console.log(`  ingesteld: ${bron.url}`);
  const eerste = await beoordeel(bron.url);
  console.log(`  → ${eerste.oordeel}: ${eerste.detail}`);

  if (eerste.oordeel === "WERKT") {
    console.log("");
    continue;
  }

  // Vraag de site zelf waar zijn feeds staan. We proberen de map boven de
  // ingestelde URL en de hoofdpagina van het domein.
  const kandidaatPaginas = [];
  try {
    const u = new URL(bron.url);
    kandidaatPaginas.push(new URL(".", u).toString(), u.origin + "/");
  } catch {
    /* onbruikbare URL */
  }

  const gevonden = new Set();
  for (const pagina of kandidaatPaginas) {
    const html = await haal(pagina, "text/html");
    if (!html.ok) continue;
    for (const feed of vindAangekondigdeFeeds(html.tekst, html.url)) gevonden.add(feed);
  }

  if (gevonden.size === 0) {
    console.log("  geen feed aangekondigd op de site — met de hand uitzoeken\n");
    teVervangen.push({ naam: bron.naam, vervanger: null });
    continue;
  }

  let beste = null;
  for (const kandidaat of gevonden) {
    const oordeel = await beoordeel(kandidaat);
    console.log(`  kandidaat: ${kandidaat}`);
    console.log(`    → ${oordeel.oordeel}: ${oordeel.detail}`);
    if (oordeel.oordeel === "WERKT" && (!beste || oordeel.aantal > beste.aantal)) {
      beste = { url: kandidaat, aantal: oordeel.aantal };
    }
  }
  teVervangen.push({ naam: bron.naam, vervanger: beste ? beste.url : null });
  console.log("");
}

console.log("=".repeat(60));
console.log("Samenvatting — over te nemen in data/nieuwsbronnen.ts:\n");
if (teVervangen.length === 0) {
  console.log("  Alle gecontroleerde bronnen werken.");
}
for (const r of teVervangen) {
  if (r.vervanger) {
    console.log(`  ${r.naam}`);
    console.log(`      url: "${r.vervanger}",   // bevestigd: true`);
  } else {
    console.log(`  ${r.naam}: geen werkend adres gevonden — kandidaat voor actief: false`);
  }
}
