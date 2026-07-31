// Bouwt de CONTEXT die het model mag duiden — SERVER-SIDE, uitsluitend uit de
// eigen API-routes (requirement 2). Het model krijgt geen tools en geen
// internettoegang; alles wat het mag zeggen staat in de string die deze module
// oplevert.

import { departementVoorPostcode, DEP_BY_CODE } from "@/lib/departements";
import { geoBoundsVoorCodes } from "@/lib/departement-bbox";
import { niveauVoor } from "@/lib/niveaus";
import type { Waarneming } from "@/lib/waarnemingen";

// Whitelisted meetgegevens voor de "Leg uit"-knop. De client stuurt deze mee,
// maar de server leest alléén deze getypeerde velden en bouwt de tekst zelf, dus
// er kan geen vrije tekst uit de client in de prompt lekken.
export interface MetingPayload {
  soort: "detectie" | "cluster" | "pluim";
  id: string;
  departementCode?: string;
  frp?: number | null;
  betrouwbaarheid?: string;
  cluster?: boolean;
  aantal?: number;
  waargenomenOp?: string;
  richting?: string;
}

// Leest de payload defensief uit onbekende JSON en normaliseert naar bekende,
// getypeerde velden (nooit rauwe strings in de prompt).
export function leesMetingPayload(ruw: unknown): MetingPayload | null {
  if (!ruw || typeof ruw !== "object") return null;
  const r = ruw as Record<string, unknown>;
  const soort = r.soort === "cluster" || r.soort === "pluim" ? r.soort : "detectie";
  const id = typeof r.id === "string" && r.id ? r.id.slice(0, 120) : null;
  if (!id) return null;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v.slice(0, 40) : undefined;
  return {
    soort,
    id,
    departementCode: str(r.departementCode),
    frp: num(r.frp) ?? (r.frp === null ? null : undefined),
    betrouwbaarheid: r.betrouwbaarheid === "hoog" || r.betrouwbaarheid === "nominaal" ? r.betrouwbaarheid : undefined,
    cluster: typeof r.cluster === "boolean" ? r.cluster : undefined,
    aantal: num(r.aantal),
    waargenomenOp: str(r.waargenomenOp),
    richting: str(r.richting),
  };
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function centroidVanCodes(codes: string[]): { lat: number; lon: number } | null {
  const b = geoBoundsVoorCodes(codes);
  if (!b) return null;
  const [[zLat, wLon], [nLat, oLon]] = b;
  return { lat: (zLat + nLat) / 2, lon: (wLon + oLon) / 2 };
}

// Kleinste afstand (km) van een referentiepunt tot een reeks detecties. Puur en
// los testbaar: met dezelfde detecties maar een ándere referentiecoördinaat
// (bijvoorbeeld twee verschillende postcodes) hoort er een andere afstand uit te
// komen — dat is precies wat de afstandsregel eist (vanaf de postcode, niet het
// departementsmiddelpunt).
export function naasteAfstandKm(
  ref: { lat: number; lon: number },
  detecties: Array<{ latitude: number; longitude: number }>
): number | null {
  if (detecties.length === 0) return null;
  return Math.min(
    ...detecties.map((d) => haversineKm(ref.lat, ref.lon, d.latitude, d.longitude))
  );
}

// Postcode → geografische coördinaat via de officiële Franse overheids-API
// (geo.api.gouv.fr, een .gouv.fr-bron). Een postcode kan meerdere gemeenten
// beslaan; we nemen het gemiddelde van de gemeente-middelpunten als postcode-
// coördinaat. Faalt de aanroep (offline, onbekende postcode), dan geeft dit null
// terug en valt de context terug op een benadering — nooit op de bewoording
// "middelpunt van het departement".
export async function geocodePostcode(
  postcode: string
): Promise<{ lat: number; lon: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(
        postcode
      )}&fields=centre&format=json`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ centre?: { coordinates?: [number, number] } }>;
    const punten = data
      .map((g) => g.centre?.coordinates)
      .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2);
    if (punten.length === 0) return null;
    const lon = punten.reduce((s, c) => s + c[0], 0) / punten.length;
    const lat = punten.reduce((s, c) => s + c[1], 0) / punten.length;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function haalJson(basisUrl: string, pad: string): Promise<any | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${basisUrl}${pad}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function niveauTekst(waarde: number | null | undefined): string {
  const n = niveauVoor(typeof waarde === "number" ? waarde : null);
  return n ? `${waarde} (${n.nl})` : "geen gegevens";
}

// Tijdstip van de meting, server-side geformatteerd in Europe/Paris. Ontbreekt
// het veld of is het niet parseerbaar, dan geven we dat letterlijk aan zodat het
// model de leegte niet zelf invult (fix 1/3).
export function formatteerMetingTijdstip(iso: string | undefined): string {
  if (!iso) return "Tijdstip van de meting: niet meegegeven.";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Tijdstip van de meting: niet meegegeven.";
  const tekst = new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
  return `Tijdstip van de meting: ${tekst}.`;
}

// ---- Duiding-context: alles rond een postcode -----------------------------
export async function bouwDuidingContext(
  postcode: string,
  basisUrl: string
): Promise<{ context: string; departement: string } | { fout: string }> {
  const res = departementVoorPostcode(postcode);
  if (res.type === "buiten-metropole") {
    return {
      fout:
        "Deze tool dekt alleen Frankrijk métropole (inclusief Corsica). Voor de overzeese gebieden is er geen Météo des forêts.",
    };
  }
  if (res.type !== "ok") {
    return { fout: "Dat is geen geldige Franse postcode van een departement in métropole." };
  }

  const codes = res.departementen.map((d) => d.code);
  const depNamen = res.departementen.map((d) => `${d.naam} (${d.code})`).join(" / ");
  const centroid = centroidVanCodes(codes);

  const [danger, waarn, rook, nieuws, postcodeCoord] = await Promise.all([
    haalJson(basisUrl, "/api/danger"),
    haalJson(basisUrl, "/api/waarnemingen"),
    haalJson(basisUrl, "/api/rookpluimen"),
    haalJson(basisUrl, "/api/nieuws"),
    geocodePostcode(postcode),
  ]);

  // Afstanden worden vanaf de postcode-coördinaat gerekend (fix 3). Lukt de
  // geocodering niet, dan is er een benadering; nooit "het departementsmiddelpunt".
  const referentie = postcodeCoord ?? centroid;
  const refIsPostcode = postcodeCoord !== null;

  const regels: string[] = [];
  regels.push(`Departement: ${depNamen}.`);

  // Gevaarniveau (per departement, morgen/overmorgen).
  if (danger?.niveaus) {
    const stukken = res.departementen.map((d) => {
      const n = danger.niveaus[d.code];
      return `${d.naam}: morgen ${niveauTekst(n?.j1)}, overmorgen ${niveauTekst(n?.j2)}`;
    });
    regels.push(`Verwacht brandgevaar (Météo-France, Météo des forêts): ${stukken.join("; ")}.`);
  } else {
    regels.push(
      "Verwacht brandgevaar: nu niet beschikbaar (de Météo des forêts loopt alleen in het seizoen juni–september, of de bron is tijdelijk onbereikbaar)."
    );
  }

  // Satellietdetecties binnen het departement + straal rond het centrum.
  const lijst: Waarneming[] = Array.isArray(waarn?.waarnemingen) ? waarn.waarnemingen : [];
  if (!waarn?.beschikbaar) {
    regels.push("Satellietwaarnemingen (NASA FIRMS/VIIRS): nu niet beschikbaar.");
  } else {
    const inDep = lijst.filter((w) => codes.includes(w.departementCode));
    const cluster = inDep.filter((w) => w.waarschijnlijkNatuurbrand).length;
    let afstandZin = "";
    if (referentie && inDep.length > 0) {
      const km = naasteAfstandKm(referentie, inDep);
      if (km !== null) {
        afstandZin = refIsPostcode
          ? ` De dichtstbijzijnde ligt ongeveer ${Math.round(km)} km van de opgegeven postcode ${postcode}.`
          : ` De dichtstbijzijnde ligt ongeveer ${Math.round(km)} km hiervandaan (bij benadering; de exacte ligging van de postcode kon nu niet worden opgehaald).`;
      }
    }
    regels.push(
      inDep.length === 0
        ? "Satellietwaarnemingen (NASA FIRMS/VIIRS, laatste 24 uur) in dit departement: geen."
        : `Satellietwaarnemingen (NASA FIRMS/VIIRS, laatste 24 uur) in dit departement: ${inDep.length}, waarvan ${cluster} bij een samenhangend cluster.${afstandZin}`
    );
  }

  // Windrichting op leefniveau: dichtstbijzijnde berekende windbaan.
  const pluimen: Array<{ lat: number; lon: number; richting: string; bronDepartementCode: string | null }> =
    Array.isArray(rook?.pluimen) ? rook.pluimen : [];
  if (!rook?.windBeschikbaar || pluimen.length === 0) {
    regels.push("Windrichting op leefniveau: geen berekende windbaan in de buurt beschikbaar.");
  } else {
    let dichtst = pluimen.find((p) => codes.includes(p.bronDepartementCode ?? ""));
    if (!dichtst && referentie) {
      dichtst = [...pluimen].sort(
        (a, b) =>
          haversineKm(referentie.lat, referentie.lon, a.lat, a.lon) -
          haversineKm(referentie.lat, referentie.lon, b.lat, b.lon)
      )[0];
    }
    // Windrichting altijd ondubbelzinnig als "waait naar …" (fix 2): richting is
    // de kompasrichting waarheen de berekende windbaan drijft, dus waar de rook
    // naartoe gaat — nooit "uit …".
    regels.push(
      dichtst
        ? `Windrichting op leefniveau (Open-Meteo, dichtstbijzijnde berekende windbaan): de wind waait naar ${dichtst.richting || "onbekend"} (de rook verplaatst zich die kant op).`
        : "Windrichting op leefniveau: geen berekende windbaan in de buurt beschikbaar."
    );
  }

  // Jongste Nederlandse nieuwssamenvattingen (koppen).
  const koppen: string[] = [];
  for (const item of [...(nieuws?.officieel ?? []), ...(nieuws?.pers ?? [])]) {
    const kop = item?.titelNl ?? item?.titel;
    if (typeof kop === "string" && kop.trim()) koppen.push(kop.trim());
    if (koppen.length >= 3) break;
  }
  regels.push(
    koppen.length > 0
      ? `Recent Nederlandstalig nieuws over natuurbranden: ${koppen.join("; ")}.`
      : "Recent Nederlandstalig nieuws over natuurbranden: geen recente koppen."
  );

  return {
    departement: depNamen,
    context: `CONTEXT (alles wat de tool nu weet voor postcode ${postcode}):\n- ${regels.join("\n- ")}`,
  };
}

// ---- Uitleg-context: één meting/cluster/pluim ------------------------------
export function bouwUitlegContext(m: MetingPayload): string {
  const depNaam = m.departementCode
    ? DEP_BY_CODE[m.departementCode]?.naam ?? `departement ${m.departementCode}`
    : "onbekend departement";
  const soortTekst =
    m.soort === "cluster"
      ? `een groep van ${m.aantal ?? "meerdere"} satellietmetingen dicht bij elkaar (een cluster)`
      : m.soort === "pluim"
        ? `een berekende windbaan vanaf een hittebron met ${m.aantal ?? "meerdere"} satellietdetecties`
        : "één losse satellietmeting";

  const regels: string[] = [];
  regels.push(`Type: ${soortTekst}.`);
  regels.push(`Departement: ${depNaam}.`);
  regels.push(formatteerMetingTijdstip(m.waargenomenOp));
  if (m.frp !== undefined) {
    regels.push(
      m.frp === null
        ? "Gemeten warmtevermogen (FRP): onbekend."
        : `Gemeten warmtevermogen (FRP): ${m.frp} MW.`
    );
  }
  if (m.betrouwbaarheid) {
    regels.push(`Betrouwbaarheid van de meting: ${m.betrouwbaarheid}.`);
  }
  if (m.cluster !== undefined) {
    regels.push(
      m.cluster
        ? "Clusterstatus: hoort bij een ruimtelijk en in tijd samenhangend cluster."
        : "Clusterstatus: losse meting, hoort niet bij een samenhangend cluster."
    );
  }
  if (m.richting) regels.push(`Berekende driftrichting van de windbaan: ${m.richting}.`);

  return (
    `CONTEXT (één ${m.soort === "detectie" ? "satellietmeting" : m.soort} om te duiden):\n- ` +
    regels.join("\n- ")
  );
}
