import { NextResponse } from "next/server";

export const revalidate = 900;

const ZOEKOPDRACHT =
  '("feu de forêt" OR "feux de forêt" OR "incendie de forêt" OR "incendie forêt") France when:7d';
const FEED_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(
  ZOEKOPDRACHT
)}&hl=fr&gl=FR&ceid=FR:fr`;

interface NieuwsItem {
  titel: string;
  url: string;
  bron: string;
  gepubliceerdOp: string | null;
}

export async function GET() {
  try {
    const reactie = await fetch(FEED_URL, {
      headers: {
        "User-Agent": "Infofrankrijk-Bosbranden/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      next: { revalidate: 900 },
    });

    if (!reactie.ok) {
      throw new Error(`Nieuwsfeed gaf HTTP ${reactie.status}.`);
    }

    const xml = await reactie.text();
    const items = parseerItems(xml).slice(0, 5);

    return NextResponse.json(
      {
        beschikbaar: true,
        items,
        bijgewerkt: new Date().toISOString(),
        bron: "Google Nieuws RSS",
        zoekperiodeDagen: 7,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
        },
      }
    );
  } catch (fout) {
    return NextResponse.json(
      {
        beschikbaar: false,
        items: [],
        bijgewerkt: null,
        bron: "Google Nieuws RSS",
        zoekperiodeDagen: 7,
        fout: fout instanceof Error ? fout.message : "Onbekende fout.",
        opmerking: "Actueel nieuws is tijdelijk niet beschikbaar.",
      },
      { status: 502 }
    );
  }
}

function parseerItems(xml: string): NieuwsItem[] {
  const blokken = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const gezien = new Set<string>();
  const items: NieuwsItem[] = [];

  for (const match of blokken) {
    const blok = match[1];
    const bron = schoonTekst(leesTag(blok, "source")) || "Onbekende nieuwsbron";
    let titel = schoonTekst(leesTag(blok, "title"));
    const url = schoonTekst(leesTag(blok, "link"));
    const pubDate = schoonTekst(leesTag(blok, "pubDate"));

    if (!titel || !isVeiligeUrl(url)) continue;

    const bronSuffix = ` - ${bron}`;
    if (titel.endsWith(bronSuffix)) {
      titel = titel.slice(0, -bronSuffix.length).trim();
    }

    const sleutel = titel.toLocaleLowerCase("fr-FR").replace(/\s+/g, " ").trim();
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);

    const datum = pubDate ? new Date(pubDate) : null;
    items.push({
      titel,
      url,
      bron,
      gepubliceerdOp:
        datum && !Number.isNaN(datum.getTime()) ? datum.toISOString() : null,
    });
  }

  return items.sort((a, b) => {
    const tijdA = a.gepubliceerdOp ? Date.parse(a.gepubliceerdOp) : 0;
    const tijdB = b.gepubliceerdOp ? Date.parse(b.gepubliceerdOp) : 0;
    return tijdB - tijdA;
  });
}

function leesTag(blok: string, tag: string): string {
  const patroon = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );
  return blok.match(patroon)?.[1] ?? "";
}

function schoonTekst(waarde: string): string {
  return decodeerXml(
    waarde
      .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeerXml(waarde: string): string {
  const benoemd: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
    nbsp: " ",
  };

  return waarde.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (volledig, code: string) => {
      if (code.startsWith("#x")) {
        const getal = Number.parseInt(code.slice(2), 16);
        return Number.isFinite(getal) ? String.fromCodePoint(getal) : volledig;
      }
      if (code.startsWith("#")) {
        const getal = Number.parseInt(code.slice(1), 10);
        return Number.isFinite(getal) ? String.fromCodePoint(getal) : volledig;
      }
      return benoemd[code.toLowerCase()] ?? volledig;
    }
  );
}

function isVeiligeUrl(waarde: string): boolean {
  try {
    const url = new URL(waarde);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
