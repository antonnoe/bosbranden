import { vindDepartementCode } from "@/lib/departement-punt";
import type { Betrouwbaarheid, Waarneming } from "@/lib/waarnemingen";

const FIRMS_BBOX = "-5.6,41.1,9.9,51.3";
const PERIODE_UREN = 24;
const API_DAGEN = 2;
const GRID_GRAAD = 0.06;

const BRONNEN = [
  { code: "VIIRS_NOAA20_NRT", naam: "NOAA-20" },
  { code: "VIIRS_NOAA21_NRT", naam: "NOAA-21" },
  { code: "VIIRS_SNPP_NRT", naam: "Suomi NPP" },
] as const;

interface RuweRij {
  latitude?: string;
  longitude?: string;
  acq_date?: string;
  acq_time?: string;
  satellite?: string;
  instrument?: string;
  confidence?: string;
  frp?: string;
  daynight?: string;
}

export interface FirmsResultaat {
  waarnemingen: Waarneming[];
  bijgewerkt: string;
  periodeUren: number;
}

export async function haalFirmsWaarnemingenOp(mapKey: string): Promise<FirmsResultaat> {
  const resultaten = await Promise.allSettled(
    BRONNEN.map(async (bron) => {
      const url =
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/` +
        `${bron.code}/${FIRMS_BBOX}/${API_DAGEN}`;

      const res = await fetch(url, { next: { revalidate: 900 } });
      const body = await res.text();

      if (!res.ok) {
        throw new Error(`NASA FIRMS ${bron.naam} antwoordde met status ${res.status}.`);
      }

      return leesCsv(body).map((rij) => normaliseerRij(rij, bron.naam));
    })
  );

  const geslaagd = resultaten.filter(
    (resultaat): resultaat is PromiseFulfilledResult<Array<Waarneming | null>> =>
      resultaat.status === "fulfilled"
  );

  if (geslaagd.length === 0) {
    const eersteFout = resultaten.find(
      (resultaat): resultaat is PromiseRejectedResult => resultaat.status === "rejected"
    );
    throw eersteFout?.reason instanceof Error
      ? eersteFout.reason
      : new Error("NASA FIRMS leverde geen bruikbare respons.");
  }

  const grens = Date.now() - PERIODE_UREN * 60 * 60 * 1000;
  const uniek = new Map<string, Waarneming>();

  for (const resultaat of geslaagd) {
    for (const waarneming of resultaat.value) {
      if (!waarneming) continue;
      if (new Date(waarneming.waargenomenOp).getTime() < grens) continue;
      uniek.set(waarneming.id, waarneming);
    }
  }

  const waarnemingen = classificeerWaarnemingen([...uniek.values()]).sort(
    (a, b) =>
      new Date(b.waargenomenOp).getTime() - new Date(a.waargenomenOp).getTime()
  );

  return {
    waarnemingen,
    bijgewerkt: new Date().toISOString(),
    periodeUren: PERIODE_UREN,
  };
}

function normaliseerRij(rij: RuweRij, bronNaam: string): Waarneming | null {
  const latitude = Number(rij.latitude);
  const longitude = Number(rij.longitude);
  const waargenomenOp = maakIsoTijd(rij.acq_date, rij.acq_time);
  const betrouwbaarheid = vertaalBetrouwbaarheid(rij.confidence);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !waargenomenOp) {
    return null;
  }

  if (!betrouwbaarheid) return null; // lage betrouwbaarheid niet tonen

  const departementCode = vindDepartementCode(latitude, longitude);
  if (!departementCode) return null; // punten in buurlanden uit de rechthoek verwijderen

  const frpGetal = Number(rij.frp);
  const frp = Number.isFinite(frpGetal) ? frpGetal : null;
  const dagNacht =
    rij.daynight?.toUpperCase() === "D"
      ? "dag"
      : rij.daynight?.toUpperCase() === "N"
        ? "nacht"
        : null;

  const id = [
    bronNaam,
    rij.acq_date,
    rij.acq_time,
    latitude.toFixed(4),
    longitude.toFixed(4),
  ].join("-");

  return {
    id,
    latitude,
    longitude,
    waargenomenOp,
    satelliet: bronNaam,
    instrument: rij.instrument || "VIIRS",
    betrouwbaarheid,
    frp,
    dagNacht,
    departementCode,
    waarschijnlijkNatuurbrand: false,
    waarschijnlijkheidsScore: 0,
    waarschijnlijkheidsRedenen: [],
  };
}

function classificeerWaarnemingen(waarnemingen: Waarneming[]): Waarneming[] {
  const grid = new Map<string, number[]>();
  const tijden = waarnemingen.map((w) => Date.parse(w.waargenomenOp));

  waarnemingen.forEach((w, index) => {
    const sleutel = gridSleutel(w.latitude, w.longitude);
    const lijst = grid.get(sleutel);
    if (lijst) lijst.push(index);
    else grid.set(sleutel, [index]);
  });

  return waarnemingen.map((waarneming, index) => {
    const kandidaten = omliggendeIndices(grid, waarneming.latitude, waarneming.longitude);
    let dichtbij = 0;
    let bredeCluster = 0;
    const passages = new Set<string>();

    for (const anderIndex of kandidaten) {
      if (anderIndex === index) continue;
      const ander = waarnemingen[anderIndex];
      const tijdsverschilUren = Math.abs(tijden[index] - tijden[anderIndex]) / 3_600_000;
      if (tijdsverschilUren > 12) continue;

      const afstandKm = haversineKm(
        waarneming.latitude,
        waarneming.longitude,
        ander.latitude,
        ander.longitude
      );

      if (afstandKm <= 6) {
        bredeCluster += 1;
        passages.add(`${ander.satelliet}-${Math.round(tijden[anderIndex] / 1_800_000)}`);
      }
      if (afstandKm <= 3 && tijdsverschilUren <= 8) dichtbij += 1;
    }

    let score = 0;
    const redenen: string[] = [];

    if (waarneming.betrouwbaarheid === "hoog") {
      score += 1;
      redenen.push("hoge VIIRS-betrouwbaarheid");
    }
    if ((waarneming.frp ?? 0) >= 15) {
      score += 2;
      redenen.push("sterk uitgestraald warmtevermogen");
    } else if ((waarneming.frp ?? 0) >= 5) {
      score += 1;
      redenen.push("verhoogd uitgestraald warmtevermogen");
    }
    if (dichtbij >= 2) {
      score += 2;
      redenen.push("meerdere nabijgelegen metingen binnen acht uur");
    } else if (dichtbij >= 1) {
      score += 1;
      redenen.push("nabijgelegen tweede meting");
    }
    if (bredeCluster >= 5) {
      score += 2;
      redenen.push("duidelijk ruimtelijk cluster");
    }
    if (passages.size >= 2) {
      score += 1;
      redenen.push("waargenomen tijdens meerdere satellietpassages");
    }

    const waarschijnlijkNatuurbrand =
      score >= 4 || (score >= 3 && (dichtbij >= 1 || (waarneming.frp ?? 0) >= 15));

    return {
      ...waarneming,
      waarschijnlijkNatuurbrand,
      waarschijnlijkheidsScore: score,
      waarschijnlijkheidsRedenen: redenen,
    };
  });
}

function gridSleutel(latitude: number, longitude: number): string {
  return `${Math.floor(latitude / GRID_GRAAD)}:${Math.floor(longitude / GRID_GRAAD)}`;
}

function omliggendeIndices(
  grid: Map<string, number[]>,
  latitude: number,
  longitude: number
): number[] {
  const basisLat = Math.floor(latitude / GRID_GRAAD);
  const basisLon = Math.floor(longitude / GRID_GRAAD);
  const resultaat: number[] = [];

  for (let dLat = -2; dLat <= 2; dLat += 1) {
    for (let dLon = -2; dLon <= 2; dLon += 1) {
      const lijst = grid.get(`${basisLat + dLat}:${basisLon + dLon}`);
      if (lijst) resultaat.push(...lijst);
    }
  }

  return resultaat;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function vertaalBetrouwbaarheid(waarde?: string): Betrouwbaarheid | null {
  const v = waarde?.trim().toLowerCase();
  if (v === "h" || v === "high") return "hoog";
  if (v === "n" || v === "nominal") return "nominaal";
  return null;
}

function maakIsoTijd(datum?: string, tijd?: string): string | null {
  if (!datum || !tijd) return null;
  const t = tijd.padStart(4, "0");
  const iso = `${datum}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function leesCsv(body: string): RuweRij[] {
  const regels = body.trim().split(/\r?\n/).filter(Boolean);
  if (regels.length < 2) return [];

  const koppen = splitsCsvRegel(regels[0]).map((kop) => kop.trim());

  return regels.slice(1).map((regel) => {
    const waarden = splitsCsvRegel(regel);
    const rij: Record<string, string> = {};
    koppen.forEach((kop, index) => {
      rij[kop] = waarden[index] ?? "";
    });
    return rij as RuweRij;
  });
}

function splitsCsvRegel(regel: string): string[] {
  const velden: string[] = [];
  let huidig = "";
  let inAanhalingstekens = false;

  for (let i = 0; i < regel.length; i += 1) {
    const teken = regel[i];

    if (teken === '"') {
      if (inAanhalingstekens && regel[i + 1] === '"') {
        huidig += '"';
        i += 1;
      } else {
        inAanhalingstekens = !inAanhalingstekens;
      }
    } else if (teken === "," && !inAanhalingstekens) {
      velden.push(huidig);
      huidig = "";
    } else {
      huidig += teken;
    }
  }

  velden.push(huidig);
  return velden;
}
