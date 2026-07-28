// Omhullende (bounding box) van een of meer departementen, zowel in
// kaartcoördinaten (voor de SVG-camera op /) als in geografische coördinaten
// (voor Leaflet fitBounds op /rook). Beide worden uit dezelfde bron afgeleid —
// de gegenereerde KAART_PADEN — zodat er geen tweede databestand of fetch nodig
// is en beide kaarten exact hetzelfde gebied tonen.

import { KAART_PADEN } from "@/lib/kaart-paths";
import { inverseProjectie } from "@/lib/kaart-projectie";

export interface KaartBbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// [zuidwest, noordoost] als [lat, lon]-paren — de vorm die Leaflet verwacht.
export type GeoBounds = [[number, number], [number, number]];

function bboxVanPad(d: string): KaartBbox | null {
  const getallen = d.match(/-?\d+(?:\.\d+)?/g);
  if (!getallen || getallen.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < getallen.length; i += 2) {
    const x = Number(getallen[i]);
    const y = Number(getallen[i + 1]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

const BBOX_PER_CODE: Record<string, KaartBbox> = Object.fromEntries(
  KAART_PADEN.map((pad) => [pad.code, bboxVanPad(pad.d)]).filter(
    (paar): paar is [string, KaartBbox] => paar[1] !== null
  )
);

// Gecombineerde kaart-omhullende van de opgegeven departementcodes (Corsica
// levert er twee). Onbekende codes worden overgeslagen.
export function kaartBboxVoorCodes(codes: string[]): KaartBbox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const code of codes) {
    const b = BBOX_PER_CODE[code];
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// Dezelfde omhullende, maar in lat/lon voor Leaflet. De y-as loopt in
// kaartruimte van boven (kleine y = noord) naar onder, dus minY hoort bij de
// hoogste breedtegraad.
export function geoBoundsVoorCodes(codes: string[]): GeoBounds | null {
  const b = kaartBboxVoorCodes(codes);
  if (!b) return null;
  const noordwest = inverseProjectie({ x: b.minX, y: b.minY });
  const zuidoost = inverseProjectie({ x: b.maxX, y: b.maxY });
  return [
    [zuidoost.latitude, noordwest.longitude],
    [noordwest.latitude, zuidoost.longitude],
  ];
}
