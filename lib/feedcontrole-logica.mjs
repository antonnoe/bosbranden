// Pure beslislogica van de feedcontrole (scripts/probeer-feeds.mjs).
// ---------------------------------------------------------------------------
// WAAROM APART. Op 26-08-2026 stuurde de feedcontrole een uitslag de deur uit
// waarin elf bronnen "geen feed aangekondigd op de site" kregen, terwijl het
// script die sites nooit had kunnen lezen: een mislukte pagina-aanvraag werd
// stil overgeslagen. Een verkeerde uitslag is erger dan geen uitslag — er was
// bijna op afgegaan door elf werkende bronnen uit te zetten.
//
// Alles wat een OORDEEL velt staat daarom hier, los van netwerk en uitvoer, en
// wordt getest in scripts/test-feedcontrole.ts. Netwerkcode mag geen conclusies
// trekken; die haalt alleen op.

// Is dit een geldig feed-document, ook als er (nu) geen items in staan? Een lege
// feed is geen kapot adres.
export function isFeedDocument(tekst) {
  const kop = String(tekst || "").slice(0, 2000);
  return /<rss[\s>]/i.test(kop) || /<feed[\s>]/i.test(kop) || /<rdf:RDF[\s>]/i.test(kop);
}

// RSS <item> én Atom <entry>, zelfde telling als lib/nieuws-filter.ts.
export function telItems(xml) {
  const t = String(xml || "");
  return (
    [...t.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].length +
    [...t.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].length
  );
}

export function nieuwsteDatum(xml) {
  const t = String(xml || "");
  const datums = [];
  for (const tag of ["pubDate", "published", "updated", "dc:date"]) {
    for (const m of t.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))) {
      const ms = Date.parse(m[1].trim());
      if (!Number.isNaN(ms)) datums.push(ms);
    }
  }
  return datums.length ? new Date(Math.max(...datums)).toISOString() : null;
}

// Waar kondigt de site zelf zijn feeds aan?
export function vindAangekondigdeFeeds(html, basis) {
  const uit = new Set();
  for (const m of String(html || "").matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?[^"'>]*alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      uit.add(new URL(href.replace(/&amp;/g, "&"), basis).toString());
    } catch {
      /* onbruikbare href */
    }
  }
  return [...uit];
}

export const PADEN = [
  "rss", "rss.xml", "feed", "feed/", "feeds/rss.xml", "atom.xml", "index.rss", "?feed=rss2",
];

// De gebruikelijke feed-paden, op de map van het ingestelde adres én op de
// hoofdmap van het domein. Elk hiervan wordt getest voordat het in een uitslag
// belandt; dit is dus geen gokken maar een lijst kandidaten om te meten.
export function conventioneleKandidaten(ingesteld) {
  let u;
  try {
    u = new URL(ingesteld);
  } catch {
    return [];
  }
  const uit = new Set();
  for (const basis of new Set([new URL(".", u).toString(), u.origin + "/"])) {
    for (const pad of PADEN) {
      try {
        uit.add(new URL(pad, basis).toString());
      } catch {
        /* overslaan */
      }
    }
  }
  uit.delete(ingesteld);
  return [...uit];
}

// HET OORDEEL DAT FOUT GING. Als er geen enkele pagina te lezen was, mag hier
// nooit "geen feed aangekondigd" uit komen: dat is een conclusie die niet is
// vastgesteld. Dan is het "onbeslist", en daar mag geen bron op worden
// uitgezet.
export function ontdekkingsOordeel(paginaGelezen, gevondenAantal) {
  if (paginaGelezen === 0) return "onbeslist";
  if (gevondenAantal === 0) return "geen-aankondiging";
  return "aangekondigd";
}

// Wat de wekelijkse bewaking als storing telt: een ACTIEVE bron waarvan het
// ingestelde adres geen feed meer levert. Uitgezette bronnen niet (dat weten we
// al) en "onbeslist" niet (dat zegt niets over de bron).
export function eindOordeel(uitslagen) {
  const lijst = Array.isArray(uitslagen) ? uitslagen : [];
  return {
    storingen: lijst.filter(
      (u) => u.actief && (u.status === "niets gevonden" || u.status === "vervanger")
    ),
    nietTeZeggen: lijst.filter((u) => u.actief && u.status === "onbeslist"),
  };
}
