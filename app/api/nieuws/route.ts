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
import { haalSamenvattingen } from "@/lib/nieuws-samenvatting";

export const revalidate = 900; // 15 minuten
// De samenvatdienst doet er ~9 s per artikel over; met parallelle aanroepen en
// een fetch-timeout van 30 s mag de functie niet eerder afkappen dan die fetch.
export const maxDuration = 60;

// RSS-feeds zijn snel; dit is een aparte, kortere timeout dan die van de
// samenvatdienst (30 s, zie lib/nieuws-samenvatting.ts).
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

  // Nederlandse samenvattingen ophalen (H): server-side, durable per artikel-URL
  // gecachet (B1), parallel (B3), met hooguit vier nieuwe aanvragen per
  // regeneratie over BEIDE groepen samen (B2). Eén gedeeld budget dus.
  const samenvattingen = await haalSamenvattingen([...officieel, ...pers]);
  const officieelNl = verrijkMetSamenvatting(officieel, samenvattingen);
  const persNl = verrijkMetSamenvatting(pers, samenvattingen);

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

function verrijkMetSamenvatting(
  items: NieuwsItem[],
  samenvattingen: Map<string, { titelNl: string | null; samenvatting: string | null; ecosystemLinks: NieuwsItem["ecosystemLinks"] } | null>
): NieuwsItem[] {
  return items.map((item) => {
    const sv = samenvattingen.get(item.url);
    if (!sv) {
      // H5/B4: falen (of nog niet aan de beurt) → Franse kop met de mededeling.
      return { ...item, vertaling: "mislukt" as const };
    }
    return {
      ...item,
      titelNl: sv.titelNl,
      samenvatting: sv.samenvatting,
      ecosystemLinks: sv.ecosystemLinks,
      vertaling: "ok" as const,
    };
  });
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
