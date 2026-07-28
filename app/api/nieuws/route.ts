import { NextResponse } from "next/server";
import { NIEUWSBRONNEN, type Nieuwsbron } from "@/data/nieuwsbronnen";
import {
  bouwAllowlist,
  filterBron,
  MAX_PER_GROEP,
  parseerFeed,
  sorteerNieuwsteBoven,
  type BronStatus,
  type NieuwsAntwoord,
  type NieuwsItem,
} from "@/lib/nieuws-filter";
import { haalSamenvatting } from "@/lib/nieuws-samenvatting";

export const revalidate = 900; // 15 minuten

const FEED_TIMEOUT_MS = 8000;

interface BronResultaat {
  bron: Nieuwsbron;
  ok: boolean;
  items: NieuwsItem[];
}

export async function GET() {
  const nu = Date.now();
  const nuIso = new Date(nu).toISOString();
  const allowlist = bouwAllowlist(NIEUWSBRONNEN);

  const resultaten = await Promise.all(
    NIEUWSBRONNEN.map((bron) => haalBron(bron, allowlist, nu))
  );

  // Groepen samenstellen, chronologisch (nieuwste boven), max 8 per groep.
  const officieel = sorteerNieuwsteBoven(
    resultaten.filter((r) => r.bron.soort === "officieel").flatMap((r) => r.items)
  ).slice(0, MAX_PER_GROEP);
  const pers = sorteerNieuwsteBoven(
    resultaten.filter((r) => r.bron.soort === "pers").flatMap((r) => r.items)
  ).slice(0, MAX_PER_GROEP);

  // Nederlandse samenvattingen ophalen (H): server-side, per artikel gecachet.
  // Alleen de getoonde items, zodat de kosten met wat zichtbaar is meeschalen.
  const [officieelNl, persNl] = await Promise.all([
    verrijkMetSamenvatting(officieel),
    verrijkMetSamenvatting(pers),
  ]);

  // Per-bron status. `aantal` telt de items die deze bron in de GETOONDE
  // (afgekapte) groepen bijdraagt, zodat de statusregel klopt met wat je ziet.
  const getoond = new Set([...officieel, ...pers]);
  const bronnen: BronStatus[] = resultaten.map((r) => ({
    naam: r.bron.naam,
    soort: r.bron.soort,
    regio: r.bron.regio,
    bevestigd: r.bron.bevestigd,
    ok: r.ok,
    aantal: r.items.filter((item) => getoond.has(item)).length,
    tijdstip: nuIso,
  }));

  const eenGeslaagd = resultaten.some((r) => r.ok);

  const antwoord: NieuwsAntwoord = {
    officieel: officieelNl,
    pers: persNl,
    bronnen,
    bijgewerkt: nuIso,
    laatstGeslaagd: eenGeslaagd ? nuIso : null,
  };

  return NextResponse.json(antwoord, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
    },
  });
}

async function verrijkMetSamenvatting(items: NieuwsItem[]): Promise<NieuwsItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const sv = await haalSamenvatting(item.url, item.titel);
      if (!sv.ok) {
        // H5: falen moet zichtbaar zijn; de Franse kop blijft, met een mededeling.
        return { ...item, vertaling: "mislukt" as const };
      }
      return {
        ...item,
        titelNl: sv.titelNl,
        samenvatting: sv.samenvatting,
        ecosystemLinks: sv.ecosystemLinks,
        vertaling: "ok" as const,
      };
    })
  );
}

async function haalBron(
  bron: Nieuwsbron,
  allowlist: Set<string>,
  nu: number
): Promise<BronResultaat> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const reactie = await fetch(bron.url, {
      headers: {
        "User-Agent": "Infofrankrijk-Bosbranden/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: controller.signal,
      next: { revalidate: 900 },
    });
    if (!reactie.ok) {
      return { bron, ok: false, items: [] };
    }
    const xml = await reactie.text();
    const ruw = parseerFeed(xml);
    const items = filterBron(ruw, bron, allowlist, nu);
    return { bron, ok: true, items };
  } catch {
    return { bron, ok: false, items: [] };
  } finally {
    clearTimeout(timer);
  }
}
