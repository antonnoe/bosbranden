// Genereert lib/kaart-paths.ts uit scripts/departements.geojson
// (bron: gregoiredavid/france-geojson, data IGN — Etalab Licence Ouverte).
// Projectie: equirectangulair met breedtegraadcorrectie (cos van de
// middelste breedtegraad), passend gemaakt op een vaste viewBox.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));
const geo = JSON.parse(readFileSync(join(hier, "departements.geojson"), "utf8"));

const BREEDTE = 1000;

// Grenzen bepalen
let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
const elkPunt = (coords, fn) => {
  if (typeof coords[0] === "number") return fn(coords);
  for (const c of coords) elkPunt(c, fn);
};
for (const f of geo.features) {
  elkPunt(f.geometry.coordinates, ([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
}

const midLat = (minLat + maxLat) / 2;
const kx = Math.cos((midLat * Math.PI) / 180);
const spanX = (maxLon - minLon) * kx;
const spanY = maxLat - minLat;
const schaal = BREEDTE / spanX;
const HOOGTE = Math.ceil(spanY * schaal);

const px = (lon) => ((lon - minLon) * kx * schaal).toFixed(1);
const py = (lat) => ((maxLat - lat) * schaal).toFixed(1);

const ringNaarPath = (ring) => {
  let d = "";
  let vorige = null;
  for (const [lon, lat] of ring) {
    const x = px(lon), y = py(lat);
    if (vorige && vorige[0] === x && vorige[1] === y) continue; // dubbele punten na afronding overslaan
    d += (d === "" ? "M" : "L") + x + " " + y;
    vorige = [x, y];
  }
  return d + "Z";
};

const paths = geo.features
  .map((f) => {
    const { code, nom } = f.properties;
    const polys =
      f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const d = polys.map((poly) => poly.map(ringNaarPath).join("")).join("");
    return { code, naam: nom, d };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

const uit = `// GEGENEREERD BESTAND — niet met de hand bewerken.
// Bron geometrie: https://github.com/gregoiredavid/france-geojson
// (departements-version-simplifiee.geojson; data IGN, Etalab Licence Ouverte).
// Regenereren: npm run generate:map

export const KAART_VIEWBOX = "0 0 ${BREEDTE} ${HOOGTE}";

export interface KaartPad {
  code: string;
  naam: string;
  d: string;
}

export const KAART_PADEN: KaartPad[] = [
${paths.map((p) => `  { code: ${JSON.stringify(p.code)}, naam: ${JSON.stringify(p.naam)}, d: ${JSON.stringify(p.d)} },`).join("\n")}
];
`;

writeFileSync(join(hier, "..", "lib", "kaart-paths.ts"), uit);
console.log(`OK: ${paths.length} departementen, viewBox 0 0 ${BREEDTE} ${HOOGTE}`);
