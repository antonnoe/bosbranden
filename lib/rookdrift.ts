// Rookdrift — server-side berekening van de verwachte windbaan vanaf
// gedetecteerde hittebronnen (FIRMS/VIIRS), gedreven door het windveld van
// Open-Meteo. Al het zware rekenwerk gebeurt hier; de client krijgt alleen de
// compacte, uitgerekende pluimen.
//
// Dit is nadrukkelijk GEEN rookmodel. Het is de berekende baan van de lucht
// vanaf een hittebron. Werkelijke rook stijgt, mengt, slaat neer en wordt door
// neerslag uitgewassen; dat zit hier niet in.

import { haalFirmsWaarnemingenOp } from "@/lib/firms";
import { vindDepartementCode } from "@/lib/departement-punt";
import { DEP_BY_CODE, departementVoorPostcode } from "@/lib/departements";
import { KAART_PADEN } from "@/lib/kaart-paths";
import { inverseProjectie } from "@/lib/kaart-projectie";
import type { Waarneming } from "@/lib/waarnemingen";

// ---- Constanten ----

const WIND_LAT_MIN = 41.5;
const WIND_LAT_MAX = 50.5;
const WIND_LON_MIN = -5.0;
const WIND_LON_MAX = 9.25;
const WIND_STAP = 0.75; // graden; 13 × 20 = 260 gridpunten

const STAPPEN = 24; // uursstappen → 25 padpunten (incl. startpunt)
const KOPPEL_KM = 5; // koppelafstand tussen naburige detecties
const MAX_CLUSTER_DIAMETER_KM = 25; // grotere fronten worden gesplitst in meerdere oorsprongen
const MAX_PLUIMEN_PER_DEP = 8; // cap per departement, zodat één ramp de kaart niet vult
const MAX_PLUIMEN = 25; // landelijk maximum, ruim genoeg voor een echte ramp

const KM_PER_GRAAD = 111.32;
const W850_MAX = 0.7; // maximale weging van het 850hPa-transportveld
const W850_TIJDSCHAAL = 8; // uren; w850 = min(0.70, t / 8)

// Cachetermijn van de databron achter de rookberekening. De verantwoording leidt
// haar termijn hiervandaan af (het windveld is nu de traagste — en enige —
// component), zodat de tekst niet sneller belooft dan de data ververst.
export const WIND_REVALIDATE_SECONDEN = 1800; // Open-Meteo windveld: 30 minuten

const DEG = Math.PI / 180;

const WINDMODUS = ["leefniveau", "ophoogte"] as const;
export type Windmodus = (typeof WINDMODUS)[number];

// ---- Gridopbouw (vaste volgorde: lat buiten, lon binnen) ----

function bouwReeks(min: number, max: number, stap: number): number[] {
  const reeks: number[] = [];
  for (let waarde = min; waarde <= max + 1e-9; waarde += stap) {
    reeks.push(Number(waarde.toFixed(4)));
  }
  return reeks;
}

const WIND_LATS = bouwReeks(WIND_LAT_MIN, WIND_LAT_MAX, WIND_STAP);
const WIND_LONS = bouwReeks(WIND_LON_MIN, WIND_LON_MAX, WIND_STAP);
const N_LAT = WIND_LATS.length;
const N_LON = WIND_LONS.length;

// ---- Types ----

export interface Pluim {
  id: string;
  lat: number;
  lon: number;
  detecties: number;
  frp: number | null;
  laatsteDetectie: string;
  bronDepartement: string | null;
  bronDepartementCode: string | null;
  // Uuroffset van het EERSTE padpunt t.o.v. nu (≤ 0): het moment waarop deze
  // hittebron werd waargenomen. Padpunt i hoort bij nu + (beginOffset + i) uur.
  // Het "nu"-punt (offset 0) staat dus op index −beginOffset. De client tekent
  // het deel vóór nu doorgetrokken (gemeten wind) en het deel ná nu gestippeld
  // (verwachte wind), en toont een bron pas als beginOffset ≤ schuifstand.
  beginOffset: number;
  leefniveau: Array<[number, number]>; // [lon, lat] per uur
  ophoogte: Array<[number, number]>;
  kmLeefniveau: number;
  kmOphoogte: number;
  richting: string; // 16-punts kompas, bijv. "OZO"
}

export interface PostcodeAntwoord {
  status: "ok" | "geen-pluimen" | "ongeldig" | "onbekend" | "buiten-metropole";
  tekst: string;
  vroegsteUur?: number;
  bronId?: string;
  modus?: Windmodus;
}

export interface PluimenResultaat {
  beschikbaar: boolean; // is de FIRMS-pijplijn gelukt?
  windBeschikbaar: boolean; // is het windveld beschikbaar (paden getekend)?
  bijgewerkt: string | null;
  startuur: string;
  opmerking?: string;
  pluimen: Pluim[];
}

// ---- Windveld ----

interface Windveld {
  tijden: string[];
  u10: number[][]; // [puntIndex][uur], oostcomponent in km/u
  v10: number[][]; // noordcomponent
  u850: number[][];
  v850: number[][];
}

interface WindMonster {
  u10: number;
  v10: number;
  u850: number;
  v850: number;
}

async function haalWindveldOp(): Promise<Windveld> {
  const lats: number[] = [];
  const lons: number[] = [];
  for (const la of WIND_LATS) {
    for (const lo of WIND_LONS) {
      lats.push(la);
      lons.push(lo);
    }
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lats.join(","));
  url.searchParams.set("longitude", lons.join(","));
  url.searchParams.set(
    "hourly",
    "wind_speed_10m,wind_direction_10m,wind_speed_850hPa,wind_direction_850hPa"
  );
  // past_days=1 haalt óók het reeds verstreken etmaal op (de geanalyseerde/
  // gemeten wind), zodat een detectie van maximaal 24 uur oud vanaf haar eigen
  // waarnemingstijd kan worden nagerekend en de tijdschuif tot −12 uur terug kan.
  // forecast_days=2 geeft de vooruitblik tot +24 uur vanaf nu.
  url.searchParams.set("past_days", "1");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("cell_selection", "nearest");

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: WIND_REVALIDATE_SECONDEN }, // 30 minuten
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo forecast antwoordde met status ${res.status}.`);
  }

  const json = await res.json();
  const reeks: Array<Record<string, unknown>> = Array.isArray(json) ? json : [json];

  if (reeks.length !== lats.length) {
    throw new Error(
      `Open-Meteo gaf ${reeks.length} punten terug, verwacht ${lats.length}.`
    );
  }

  const eerste = reeks[0]?.hourly as { time?: string[] } | undefined;
  const tijden = eerste?.time ?? [];
  if (tijden.length === 0) throw new Error("Open-Meteo leverde geen tijdstappen.");

  const u10: number[][] = [];
  const v10: number[][] = [];
  const u850: number[][] = [];
  const v850: number[][] = [];

  for (let p = 0; p < reeks.length; p += 1) {
    const uur = reeks[p].hourly as {
      wind_speed_10m?: Array<number | null>;
      wind_direction_10m?: Array<number | null>;
      wind_speed_850hPa?: Array<number | null>;
      wind_direction_850hPa?: Array<number | null>;
    };

    const ws10 = uur.wind_speed_10m ?? [];
    const wd10 = uur.wind_direction_10m ?? [];
    const ws850 = uur.wind_speed_850hPa ?? [];
    const wd850 = uur.wind_direction_850hPa ?? [];

    const ru10: number[] = [];
    const rv10: number[] = [];
    const ru850: number[] = [];
    const rv850: number[] = [];

    for (let h = 0; h < tijden.length; h += 1) {
      const [pu10, pv10] = naarComponenten(ws10[h], wd10[h]);
      const [pu850, pv850] = naarComponenten(ws850[h], wd850[h]);
      ru10.push(pu10);
      rv10.push(pv10);
      ru850.push(pu850);
      rv850.push(pv850);
    }

    u10.push(ru10);
    v10.push(rv10);
    u850.push(ru850);
    v850.push(rv850);
  }

  return { tijden, u10, v10, u850, v850 };
}

// wind_direction is meteorologisch (waar de wind vandaan komt); de
// transportrichting is richting + 180. We interpoleren later u en v, nooit de
// richting in graden zelf.
function naarComponenten(
  snelheid: number | null | undefined,
  richting: number | null | undefined
): [number, number] {
  if (snelheid == null || richting == null) return [0, 0];
  const a = (richting + 180) * DEG;
  return [snelheid * Math.sin(a), snelheid * Math.cos(a)];
}

function zoekIndex(waarden: number[], x: number): { i: number; f: number } {
  const n = waarden.length;
  if (x <= waarden[0]) return { i: 0, f: 0 };
  if (x >= waarden[n - 1]) return { i: n - 2, f: 1 };
  let i = 0;
  while (i < n - 1 && waarden[i + 1] < x) i += 1;
  const f = (x - waarden[i]) / (waarden[i + 1] - waarden[i]);
  return { i, f };
}

// Bilineaire interpolatie van de windcomponenten op (lat, lon) voor uur h.
function monsterWind(veld: Windveld, lat: number, lon: number, h: number): WindMonster {
  const uur = Math.min(Math.max(h, 0), veld.tijden.length - 1);
  const { i: iLat, f: fLat } = zoekIndex(WIND_LATS, lat);
  const { i: iLon, f: fLon } = zoekIndex(WIND_LONS, lon);

  const p00 = iLat * N_LON + iLon;
  const p01 = iLat * N_LON + (iLon + 1);
  const p10 = (iLat + 1) * N_LON + iLon;
  const p11 = (iLat + 1) * N_LON + (iLon + 1);

  const bil = (comp: number[][]): number => {
    const boven = comp[p00][uur] + (comp[p01][uur] - comp[p00][uur]) * fLon;
    const onder = comp[p10][uur] + (comp[p11][uur] - comp[p10][uur]) * fLon;
    return boven + (onder - boven) * fLat;
  };

  return {
    u10: bil(veld.u10),
    v10: bil(veld.v10),
    u850: bil(veld.u850),
    v850: bil(veld.v850),
  };
}

// ---- Trajectintegratie (voorwaartse Euler, 1-uursstappen) ----

// Integreert het luchttraject van uurindex `vanIndex` (de waarnemingstijd van de
// bron) tot uurindex `totIndex` (nu + 24 uur). Padpunt 0 ligt op de bron; elk
// volgend punt is één uur later. Zo ontstaat één doorlopende baan die zowel het
// reeds verstreken deel (gemeten/geanalyseerde wind, vóór nu) als de vooruitblik
// (verwachte wind, ná nu) bevat — de client knipt en kleurt op het "nu"-punt.
function integreerTraject(
  startLat: number,
  startLon: number,
  veld: Windveld,
  vanIndex: number,
  totIndex: number,
  opHoogte: boolean
): Array<[number, number]> {
  const pad: Array<[number, number]> = [[rond(startLon), rond(startLat)]];
  let lat = startLat;
  let lon = startLon;

  const eind = Math.min(totIndex, veld.tijden.length - 1);
  for (let idx = vanIndex; idx < eind; idx += 1) {
    const t = idx - vanIndex; // uren sinds vrijkomen bij de bron
    const w = monsterWind(veld, lat, lon, idx);

    let u = w.u10;
    let v = w.v10;
    if (opHoogte) {
      const w850 = Math.min(W850_MAX, t / W850_TIJDSCHAAL);
      u = (1 - w850) * w.u10 + w850 * w.u850;
      v = (1 - w850) * w.v10 + w850 * w.v850;
    }

    const dlat = v / KM_PER_GRAAD;
    const dlon = u / (KM_PER_GRAAD * Math.cos(lat * DEG));
    lat += dlat;
    lon += dlon;
    pad.push([rond(lon), rond(lat)]);
  }

  return pad;
}

// Uurindex in het windveld van de waarnemingstijd van een cluster, afgekapt op
// het venster en nooit ná nu (een detectie ligt altijd in het verleden).
function detectieIndex(veld: Windveld, isoTijd: string, startIndex: number): number {
  const d = new Date(isoTijd);
  if (Number.isNaN(d.getTime())) return startIndex;
  d.setUTCMinutes(0, 0, 0);
  const sleutel = d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:00"
  const idx = veld.tijden.indexOf(sleutel);
  // Ouder dan het venster (of niet gevonden): begin ten hoogste 24 uur terug.
  if (idx < 0) return Math.max(0, startIndex - STAPPEN);
  return Math.min(Math.max(idx, startIndex - STAPPEN), startIndex);
}

function padLengteKm(pad: Array<[number, number]>): number {
  let som = 0;
  for (let i = 1; i < pad.length; i += 1) {
    som += haversineKm(pad[i - 1][1], pad[i - 1][0], pad[i][1], pad[i][0]);
  }
  return Math.round(som);
}

function kompasRichting(pad: Array<[number, number]>): string {
  if (pad.length < 2) return "";
  const [lon1, lat1] = pad[0];
  const [lon2, lat2] = pad[pad.length - 1];
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const graden = (Math.atan2(y, x) / DEG + 360) % 360;
  const namen = [
    "N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO",
    "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW",
  ];
  return namen[Math.round(graden / 22.5) % 16];
}

// ---- Clustering van FIRMS-detecties ----
//
// Eén brand levert veel detecties; we willen één pluim per brandhaard, niet per
// pixel. Maar een brandcomplex van tientallen kilometers (zoals Gironde/Landes,
// juli 2026) is géén punt: dan horen er meerdere oorsprongen langs de vuurlijn
// te komen. Daarom:
//   1. korte koppeling (5 km) voegt naburige detecties samen tot fronten;
//   2. fronten breder dan MAX_CLUSTER_DIAMETER_KM worden in een raster gesplitst,
//      zodat een groot complex meerdere pluimoorsprongen krijgt;
//   3. de cap is per departement (plus een ruim landelijk maximum), zodat één
//      ramp niet alle plekken opsoupeert en andere departementen zichtbaar blijven.

export interface Cluster {
  lat: number;
  lon: number;
  detecties: number;
  frp: number | null;
  laatsteDetectie: string;
  departementCode: string | null;
  diameterKm: number; // diameter van de brandhaard (kaderdiagonaal in km)
}

// Geëxporteerd zodat de clustering met echte data controleerbaar is
// (o.a. dat geen enkele getekende cluster een diameter boven de grens houdt).
export function clusterDetecties(ws: Waarneming[]): Cluster[] {
  const groepen = koppelDetecties(ws);

  // Splits fronten waarvan de diameter (kaderdiagonaal) boven de grens uitkomt.
  const deelgroepen: number[][] = [];
  for (const indices of groepen) {
    if (indices.length === 0) continue;
    if (frontDiameterKm(ws, indices) <= MAX_CLUSTER_DIAMETER_KM) {
      deelgroepen.push(indices);
    } else {
      deelgroepen.push(...splitsFront(ws, indices));
    }
  }

  const clusters = deelgroepen.map((indices) => maakCluster(ws, indices));
  return begrensPluimen(clusters);
}

// Stap 1: single-linkage union-find op korte afstand (KOPPEL_KM).
function koppelDetecties(ws: Waarneming[]): number[][] {
  const n = ws.length;
  const ouder = Array.from({ length: n }, (_, i) => i);

  const vind = (i: number): number => {
    let r = i;
    while (ouder[r] !== r) r = ouder[r];
    while (ouder[i] !== r) {
      const volgende = ouder[i];
      ouder[i] = r;
      i = volgende;
    }
    return r;
  };
  const koppel = (a: number, b: number) => {
    const ra = vind(a);
    const rb = vind(b);
    if (ra !== rb) ouder[ra] = rb;
  };

  // Bucket ~0,08° (≈9 km bij deze breedte); met ±1 buur ruim genoeg voor 5 km.
  const bucketGraad = 0.08;
  const buckets = new Map<string, number[]>();
  const sleutel = (la: number, lo: number) =>
    `${Math.floor(la / bucketGraad)}:${Math.floor(lo / bucketGraad)}`;

  ws.forEach((w, i) => {
    const s = sleutel(w.latitude, w.longitude);
    const lijst = buckets.get(s);
    if (lijst) lijst.push(i);
    else buckets.set(s, [i]);
  });

  ws.forEach((w, i) => {
    const bLat = Math.floor(w.latitude / bucketGraad);
    const bLon = Math.floor(w.longitude / bucketGraad);
    for (let dLat = -1; dLat <= 1; dLat += 1) {
      for (let dLon = -1; dLon <= 1; dLon += 1) {
        const buren = buckets.get(`${bLat + dLat}:${bLon + dLon}`);
        if (!buren) continue;
        for (const j of buren) {
          if (j <= i) continue;
          const ander = ws[j];
          if (
            haversineKm(w.latitude, w.longitude, ander.latitude, ander.longitude) <= KOPPEL_KM
          ) {
            koppel(i, j);
          }
        }
      }
    }
  });

  const groepen = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const r = vind(i);
    const lijst = groepen.get(r);
    if (lijst) lijst.push(i);
    else groepen.set(r, [i]);
  }
  return [...groepen.values()];
}

// Diameter van het omhullende kader in km (diagonaal; bovengrens op de echte
// maximale onderlinge afstand binnen de groep).
function frontDiameterKm(ws: Waarneming[], indices: number[]): number {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const idx of indices) {
    const w = ws[idx];
    minLat = Math.min(minLat, w.latitude);
    maxLat = Math.max(maxLat, w.latitude);
    minLon = Math.min(minLon, w.longitude);
    maxLon = Math.max(maxLon, w.longitude);
  }
  const nsKm = (maxLat - minLat) * KM_PER_GRAAD;
  const midLat = (minLat + maxLat) / 2;
  const ewKm = (maxLon - minLon) * KM_PER_GRAAD * Math.cos(midLat * DEG);
  return Math.hypot(nsKm, ewKm);
}

// Stap 2: verdeel een breed front over rastercellen. De celzijde is de grens
// gedeeld door √2, zodat de celdiagonaal — en daarmee de diameter van elke
// subcluster — op of onder MAX_CLUSTER_DIAMETER_KM blijft.
function splitsFront(ws: Waarneming[], indices: number[]): number[][] {
  const midLat =
    indices.reduce((som, idx) => som + ws[idx].latitude, 0) / indices.length;
  const celKm = MAX_CLUSTER_DIAMETER_KM / Math.SQRT2;
  const celLat = celKm / KM_PER_GRAAD;
  const celLon = celKm / (KM_PER_GRAAD * Math.cos(midLat * DEG));

  const cellen = new Map<string, number[]>();
  for (const idx of indices) {
    const w = ws[idx];
    const sleutel = `${Math.floor(w.latitude / celLat)}:${Math.floor(w.longitude / celLon)}`;
    const lijst = cellen.get(sleutel);
    if (lijst) lijst.push(idx);
    else cellen.set(sleutel, [idx]);
  }
  return [...cellen.values()];
}

function maakCluster(ws: Waarneming[], indices: number[]): Cluster {
  let somLat = 0;
  let somLon = 0;
  let somFrp = 0;
  let heeftFrp = false;
  let laatste = "";

  for (const idx of indices) {
    const w = ws[idx];
    somLat += w.latitude;
    somLon += w.longitude;
    if (w.frp != null) {
      somFrp += w.frp;
      heeftFrp = true;
    }
    if (!laatste || Date.parse(w.waargenomenOp) > Date.parse(laatste)) {
      laatste = w.waargenomenOp;
    }
  }

  const lat = somLat / indices.length;
  const lon = somLon / indices.length;
  return {
    lat,
    lon,
    detecties: indices.length,
    frp: heeftFrp ? Math.round(somFrp * 10) / 10 : null,
    laatsteDetectie: laatste,
    departementCode: vindDepartementCode(lat, lon),
    diameterKm: Math.round(frontDiameterKm(ws, indices) * 10) / 10,
  };
}

// Stap 3: weeg op omvang. We rangschikken alle clusters landelijk op aantal
// detecties en FRP en nemen de zwaarste tot het landelijke maximum. De
// per-departement-limiet dient alleen om te voorkomen dat één departement álle
// plekken opslokt — niet om elk departement evenveel ruimte te geven. Zo levert
// een groot brandcomplex meerdere fronten terwijl een los detectiepuntje geen
// echt front verdringt.
function begrensPluimen(clusters: Cluster[]): Cluster[] {
  const sorteer = (a: Cluster, b: Cluster) =>
    b.detecties - a.detecties || (b.frp ?? 0) - (a.frp ?? 0);

  // Per departement afkappen op MAX_PLUIMEN_PER_DEP (anti-monopolie).
  const perDep = new Map<string, Cluster[]>();
  for (const cluster of clusters) {
    const sleutel = cluster.departementCode ?? "onbekend";
    const lijst = perDep.get(sleutel);
    if (lijst) lijst.push(cluster);
    else perDep.set(sleutel, [cluster]);
  }

  const kandidaten: Cluster[] = [];
  for (const lijst of perDep.values()) {
    lijst.sort(sorteer);
    kandidaten.push(...lijst.slice(0, MAX_PLUIMEN_PER_DEP));
  }

  // Landelijk op omvang wegen en de zwaarste tot het maximum nemen.
  kandidaten.sort(sorteer);
  return kandidaten.slice(0, MAX_PLUIMEN);
}

// ---- Hoofdorkestratie ----

export async function berekenPluimen(): Promise<PluimenResultaat> {
  const startuur = huidigUur();
  const mapKey = process.env.FIRMS_MAP_KEY?.trim();

  if (!mapKey) {
    return {
      beschikbaar: false,
      windBeschikbaar: false,
      bijgewerkt: null,
      startuur,
      opmerking:
        "Satellietwaarnemingen zijn tijdelijk niet beschikbaar, daarom kunnen geen pluimen worden getekend.",
      pluimen: [],
    };
  }

  let detecties: Waarneming[];
  try {
    const firms = await haalFirmsWaarnemingenOp(mapKey);
    detecties = firms.waarnemingen;
  } catch {
    return {
      beschikbaar: false,
      windBeschikbaar: false,
      bijgewerkt: null,
      startuur,
      opmerking:
        "Satellietwaarnemingen zijn tijdelijk niet beschikbaar, daarom kunnen geen pluimen worden getekend.",
      pluimen: [],
    };
  }

  const clusters = clusterDetecties(detecties);

  if (clusters.length === 0) {
    return {
      beschikbaar: true,
      windBeschikbaar: false,
      bijgewerkt: new Date().toISOString(),
      startuur,
      opmerking:
        "Er zijn de afgelopen 24 uur geen hittebronnen gedetecteerd in Frankrijk. Er zijn dus geen pluimen te tekenen.",
      pluimen: [],
    };
  }

  // Bronnen zonder windbaan: bij een windstoring toont de kaart deze wél.
  const bronPluimen: Pluim[] = clusters.map((c) => maakBasisPluim(c));

  let veld: Windveld;
  try {
    veld = await haalWindveldOp();
  } catch {
    return {
      beschikbaar: true,
      windBeschikbaar: false,
      bijgewerkt: new Date().toISOString(),
      startuur,
      opmerking:
        "Het windmodel is tijdelijk onbereikbaar. De gedetecteerde hittebronnen worden wel getoond, maar de windbanen kunnen nu niet worden berekend.",
      pluimen: bronPluimen,
    };
  }

  const startIndex = Math.max(0, veld.tijden.indexOf(startuur.slice(0, 16)));
  const totIndex = startIndex + STAPPEN; // nu + 24 uur

  const pluimen: Pluim[] = clusters.map((c, index) => {
    const basis = bronPluimen[index];
    const vanIndex = detectieIndex(veld, c.laatsteDetectie, startIndex);
    const beginOffset = vanIndex - startIndex; // ≤ 0
    const nuIndex = -beginOffset; // index van het "nu"-punt in de baan
    const leef = integreerTraject(c.lat, c.lon, veld, vanIndex, totIndex, false);
    const hoog = integreerTraject(c.lat, c.lon, veld, vanIndex, totIndex, true);
    // km en driftrichting meten we over het toekomstige deel (nu → +24 uur),
    // zodat "… km in 24 uur" en de richting op de verwachting slaan.
    const leefToekomst = leef.slice(nuIndex);
    const hoogToekomst = hoog.slice(nuIndex);
    return {
      ...basis,
      beginOffset,
      leefniveau: leef,
      ophoogte: hoog,
      kmLeefniveau: padLengteKm(leefToekomst),
      kmOphoogte: padLengteKm(hoogToekomst),
      richting: kompasRichting(leefToekomst),
    };
  });

  return {
    beschikbaar: true,
    windBeschikbaar: true,
    bijgewerkt: new Date().toISOString(),
    startuur,
    pluimen,
  };
}

function maakBasisPluim(c: Cluster): Pluim {
  const code = c.departementCode;
  return {
    id: `pluim-${c.lat.toFixed(3)}-${c.lon.toFixed(3)}`,
    lat: rond(c.lat),
    lon: rond(c.lon),
    detecties: c.detecties,
    frp: c.frp,
    laatsteDetectie: c.laatsteDetectie,
    bronDepartementCode: code,
    bronDepartement: code ? DEP_BY_CODE[code]?.naam ?? null : null,
    beginOffset: 0,
    leefniveau: [],
    ophoogte: [],
    kmLeefniveau: 0,
    kmOphoogte: 0,
    richting: "",
  };
}

// ---- Postcode-antwoord (paragraaf 5) ----

export function bepaalPostcodeAntwoord(
  pluimen: Pluim[],
  postcode: string,
  startuur: string
): PostcodeAntwoord {
  const res = departementVoorPostcode(postcode);

  if (res.type === "ongeldig") {
    return {
      status: "ongeldig",
      tekst: "Dat is geen geldige Franse postcode. Vul precies 5 cijfers in, bijvoorbeeld 66000.",
    };
  }
  if (res.type === "buiten-metropole") {
    return {
      status: "buiten-metropole",
      tekst:
        "Deze module dekt alleen Frankrijk métropole (incl. Corsica). Voor de overzeese gebieden zijn geen pluimen beschikbaar.",
    };
  }
  if (res.type === "onbekend") {
    return {
      status: "onbekend",
      tekst: "Deze postcode hoort niet bij een Frans departement. Controleer de invoer.",
    };
  }

  const codes = new Set(res.departementen.map((d) => d.code));
  const depNaam = res.departementen.map((d) => d.naam).join(" / ");

  const metPad = pluimen.filter((p) => p.leefniveau.length > 0 || p.ophoogte.length > 0);

  if (metPad.length === 0) {
    return {
      status: "geen-pluimen",
      tekst: `Er zijn nu geen berekende pluimen, dus er komt niets richting ${depNaam}.`,
    };
  }

  let beste: { uur: number; pluim: Pluim; modus: Windmodus } | null = null;

  // De postcode-check is vooruitkijkend ("in de komende 24 uur"): we lopen
  // alleen het toekomstige deel van elke baan af, vanaf het "nu"-punt.
  for (const pluim of metPad) {
    const nuIndex = -pluim.beginOffset;
    for (const modus of WINDMODUS) {
      const pad = pluim[modus];
      for (let i = Math.max(0, nuIndex); i < pad.length; i += 1) {
        const uur = i - nuIndex; // uren vanaf nu
        const [lon, lat] = pad[i];
        const code = vindDepartementCode(lat, lon);
        if (code && codes.has(code)) {
          if (!beste || uur < beste.uur) beste = { uur, pluim, modus };
          break;
        }
      }
    }
  }

  if (beste) {
    const bron = beste.pluim.bronDepartement
      ? `de brand in ${beste.pluim.bronDepartement}`
      : "een gedetecteerde hittebron";
    const laag = beste.modus === "leefniveau" ? "op leefniveau" : "op hoogte";
    const klok =
      beste.uur === 0
        ? "nu al"
        : `rond ${klokVoor(startuur, beste.uur)}`;
    return {
      status: "ok",
      vroegsteUur: beste.uur,
      bronId: beste.pluim.id,
      modus: beste.modus,
      tekst: `Pluim vanaf ${bron} komt ${klok} boven ${depNaam}, ${laag}.`,
    };
  }

  const km = minAfstandTotDepartementKm(metPad, codes);
  const telwoord = telwoordVoor(metPad.length);
  const aanhef =
    metPad.length === 1
      ? "De enige gedetecteerde pluim komt"
      : `Geen van de ${telwoord} pluimen komt`;
  const afstand =
    km != null
      ? ` De dichtstbijzijnde pluim blijft op ongeveer ${km} km van uw departement.`
      : "";

  return {
    status: "ok",
    tekst: `${aanhef} in de komende 24 uur boven ${depNaam}.${afstand}`,
  };
}

// ---- Departementsgeometrie in geografische coördinaten (voor afstanden) ----

const DEP_GEO_PUNTEN: Record<string, Array<{ lat: number; lon: number }>> = (() => {
  const kaart: Record<string, Array<{ lat: number; lon: number }>> = {};
  for (const pad of KAART_PADEN) {
    const punten: Array<{ lat: number; lon: number }> = [];
    for (const match of pad.d.matchAll(/M([^Z]+)Z/g)) {
      const getallen = match[1].match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      for (let i = 0; i + 1 < getallen.length; i += 2) {
        const { latitude, longitude } = inverseProjectie({ x: getallen[i], y: getallen[i + 1] });
        punten.push({ lat: latitude, lon: longitude });
      }
    }
    kaart[pad.code] = punten;
  }
  return kaart;
})();

function minAfstandTotDepartementKm(pluimen: Pluim[], codes: Set<string>): number | null {
  const doelen: Array<{ lat: number; lon: number }> = [];
  for (const code of codes) {
    const punten = DEP_GEO_PUNTEN[code];
    if (punten) doelen.push(...punten);
  }
  if (doelen.length === 0) return null;

  let min = Infinity;
  for (const pluim of pluimen) {
    const nuIndex = Math.max(0, -pluim.beginOffset);
    for (const modus of WINDMODUS) {
      const pad = pluim[modus];
      for (let i = nuIndex; i < pad.length; i += 1) {
        const [lon, lat] = pad[i];
        for (const doel of doelen) {
          const d = haversineKm(lat, lon, doel.lat, doel.lon);
          if (d < min) min = d;
        }
      }
    }
  }
  return Number.isFinite(min) ? Math.round(min) : null;
}

// ---- Hulpfuncties ----

function huidigUur(): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

function klokVoor(startuur: string, urenErbij: number): string {
  const d = new Date(startuur);
  d.setUTCHours(d.getUTCHours() + urenErbij);
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}

const TELWOORDEN = [
  "nul", "één", "twee", "drie", "vier", "vijf", "zes",
  "zeven", "acht", "negen", "tien", "elf", "twaalf",
];
function telwoordVoor(n: number): string {
  return TELWOORDEN[n] ?? String(n);
}

function rond(waarde: number): number {
  return Math.round(waarde * 100000) / 100000;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
