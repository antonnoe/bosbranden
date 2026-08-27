// Zoekt bij gemeten brandhaarden een persbericht over dezelfde brand.
//
// De regels staan in lib/mediakoppeling.ts (puur en getest); dit bestand doet
// het onhandige werk: feeds ophalen, plaatsnamen geocoderen, aan elkaar knopen.
//
// De trigger is de satellietmelding, niet het nieuws: we zoeken alléén bij
// haarden die de brandbeoordeling al heeft gemarkeerd. Dat scheelt geocoder-
// aanroepen en houdt de bewering klein — we bevestigen iets wat we al zagen,
// we gaan niet op zoek naar branden in de krant.
//
// Deze module mag NOOIT de kaart laten omvallen. Elke fout eindigt in een lege
// uitkomst: geen treffers is een volstrekt normale toestand (zie het lange
// voorbehoud in lib/mediakoppeling.ts).

import { ACTIEVE_BRONNEN, type Nieuwsbron } from "@/data/nieuwsbronnen";
import { bouwAllowlist, filterBron, parseerFeed } from "@/lib/nieuws-filter";
import { FEED_REVALIDATE_S } from "@/lib/nieuws-vers";
import {
  besteTrefferVoorHaard,
  haalPlaatsnamenUitKop,
  kiesOndubbelzinnig,
  type Brandhaard,
  type GeocodeKandidaat,
  type Kandidaatbericht,
  type MediaTreffer,
} from "@/lib/mediakoppeling";

const FEED_TIMEOUT_MS = 6000;
const GEOCODE_TIMEOUT_MS = 6000;
const GEOCODE_REVALIDATE_S = 86400; // gemeentecoördinaten liggen vast

// Bovengrens op het aantal berichten dat we geocoderen. De onderwerpzeef laat
// er normaal een handvol door; deze grens is er voor de dag dat een feed
// ontspoort, zodat we de geocoder niet leegtrekken.
const MAX_TE_GEOCODEREN = 25;

export type { MediaTreffer };

// Haalt de actieve feeds op en houdt alleen de koppen over die de onderwerpzeef
// van lib/nieuws-thema.ts als natuurbrandnieuws erkent — diezelfde zeef gooit
// autobranden en gebouwbranden er al uit.
async function haalBrandberichten(): Promise<
  Array<{ titel: string; url: string; bron: string; gepubliceerdOp: string }>
> {
  const allowlist = bouwAllowlist(ACTIEVE_BRONNEN);
  const nu = Date.now();

  const perBron = await Promise.all(
    ACTIEVE_BRONNEN.map(async (bron: Nieuwsbron) => {
      try {
        const res = await fetch(bron.url, {
          headers: {
            "User-Agent": "Infofrankrijk-Bosbranden/1.0",
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          },
          signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
          next: { revalidate: FEED_REVALIDATE_S },
        });
        if (!res.ok) return [];
        const { items } = filterBron(parseerFeed(await res.text()), bron, allowlist, nu);
        return items.map((item) => ({
          titel: item.titel,
          url: item.url,
          bron: item.bron,
          gepubliceerdOp: item.gepubliceerdOp,
        }));
      } catch {
        return [];
      }
    })
  );

  return perBron.flat();
}

interface GeopfFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { score?: number; citycode?: string; city?: string };
}

// Zoekt één gemeentenaam op bij de Géoplateforme-geocoder (dezelfde dienst die
// app/api/fr-alert/route.ts gebruikt). type=municipality dwingt gemeenteniveau
// af, zodat een straatnaam of een POI nooit als plaats kan doorgaan.
async function geocodeerGemeente(naam: string): Promise<GeocodeKandidaat | null> {
  const url = new URL("https://data.geopf.fr/geocodage/search");
  url.searchParams.set("q", naam);
  url.searchParams.set("type", "municipality");
  url.searchParams.set("limit", "5");

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Infofrankrijk-Bosbranden/1.0" },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      next: { revalidate: GEOCODE_REVALIDATE_S },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { features?: GeopfFeature[] };
    const kandidaten: GeocodeKandidaat[] = [];

    for (const feature of json.features ?? []) {
      const co = feature.geometry?.coordinates;
      const p = feature.properties;
      if (!co || !p?.citycode || typeof p.score !== "number") continue;
      const [longitude, latitude] = co;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      kandidaten.push({
        score: p.score,
        citycode: p.citycode,
        city: p.city ?? naam,
        latitude,
        longitude,
      });
    }

    return kiesOndubbelzinnig(kandidaten);
  } catch {
    return null;
  }
}

// Bouwt de lijst berichten mét coördinaten. Per bericht wordt hooguit één
// plaatsnaam gebruikt: de eerste die de geocoder ondubbelzinnig herkent.
async function bouwKandidaten(): Promise<Kandidaatbericht[]> {
  const berichten = await haalBrandberichten();
  if (berichten.length === 0) return [];

  // Ontdubbelen op URL: dezelfde kop kan via twee feeds binnenkomen.
  const uniek = new Map<string, (typeof berichten)[number]>();
  for (const bericht of berichten) uniek.set(bericht.url, bericht);

  const teDoen = [...uniek.values()].slice(0, MAX_TE_GEOCODEREN);
  const cache = new Map<string, GeocodeKandidaat | null>();

  const resultaten = await Promise.all(
    teDoen.map(async (bericht) => {
      for (const naam of haalPlaatsnamenUitKop(bericht.titel)) {
        let plaats = cache.get(naam);
        if (plaats === undefined) {
          plaats = await geocodeerGemeente(naam);
          cache.set(naam, plaats);
        }
        if (plaats) return { ...bericht, plaats } satisfies Kandidaatbericht;
      }
      return null;
    })
  );

  return resultaten.filter((r): r is Kandidaatbericht => r !== null);
}

// Zoekt per haard de beste treffer. `haarden` bevat alléén de gemarkeerde
// brandhaarden; de sleutel van de teruggegeven map is de index in die lijst.
export async function zoekMediatreffers(
  haarden: Brandhaard[]
): Promise<Map<number, MediaTreffer>> {
  const treffers = new Map<number, MediaTreffer>();
  if (haarden.length === 0) return treffers;

  try {
    const kandidaten = await bouwKandidaten();
    if (kandidaten.length === 0) return treffers;

    haarden.forEach((haard, index) => {
      const treffer = besteTrefferVoorHaard(kandidaten, haard);
      if (treffer) treffers.set(index, treffer);
    });
  } catch {
    // Geen treffers is een normale uitkomst; een storing mag niet anders
    // uitpakken dan "we hebben niets gevonden".
    return treffers;
  }

  return treffers;
}
