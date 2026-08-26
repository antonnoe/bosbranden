import { NextResponse } from "next/server";
import { NIEUWSBRONNEN, type Nieuwsbron } from "@/data/nieuwsbronnen";
import {
  bouwAllowlist,
  filterBron,
  legeTelling,
  MAX_PER_GROEP,
  parseerFeed,
  sorteerNieuwsteBoven,
  totaalGeweigerd,
  type BronStatus,
  type NieuwsAntwoord,
  type NieuwsItem,
  type ZeefTelling,
} from "@/lib/nieuws-filter";
import { haalSamenvattingen } from "@/lib/nieuws-samenvatting";
import { NIEUWS_CDN_SWR_S, NIEUWS_CDN_MAXAGE_S, FEED_REVALIDATE_S } from "@/lib/nieuws-vers";

// GEEN route-revalidate meer. Die stond op 900 s en maakte van deze route een
// ISR-pagina: Next bewaarde één gerenderd antwoord en serveerde dat bij de
// eerstvolgende aanvraag ONGEWIJZIGD, waarna hij pas op de achtergrond
// verversde. Op een tool met weinig verkeer betekent dat: wie na dagen stilte
// de lade opent, krijgt de stand van de laatste bezoeker vóór hem, en pas bij
// een tweede opening het verse antwoord. Precies het gedrag dat op 26-08-2026
// werd waargenomen (eerst 1 augustus, daarna 26 augustus).
//
// De route is nu dynamisch: hij stelt het antwoord bij elke aanvraag opnieuw
// samen. Dat is goedkoop, want de dure delen zitten in hun eigen caches die
// blijven staan — de feeds via next.revalidate (FEED_REVALIDATE_S) en de
// samenvattingen in de durable Data Cache. De CDN-vensters hieronder begrenzen
// wat een bezoeker maximaal aan ouderdom kan zien.
export const dynamic = "force-dynamic";
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
  geweigerd: ZeefTelling;
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
    geweigerd: totaalGeweigerd(r.geweigerd),
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
      // Begrensd venster: hooguit NIEUWS_CDN_MAXAGE_S vers + NIEUWS_CDN_SWR_S
      // stale. Samen ruim binnen het uur dat de zijlade als bovengrens hanteert.
      "Cache-Control": `public, s-maxage=${NIEUWS_CDN_MAXAGE_S}, stale-while-revalidate=${NIEUWS_CDN_SWR_S}`,
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
      next: { revalidate: FEED_REVALIDATE_S },
    });
    if (!reactie.ok) {
      return { bron, ok: false, items: [], geweigerd: legeTelling() };
    }
    const xml = await reactie.text();
    const ruw = parseerFeed(xml);
    const { items, geweigerd } = filterBron(ruw, bron, allowlist, nu);
    return { bron, ok: true, items, geweigerd };
  } catch {
    return { bron, ok: false, items: [], geweigerd: legeTelling() };
  } finally {
    clearTimeout(timer);
  }
}
