// Dezelfde equirectangulaire projectie als scripts/generate-map.mjs.
// De extrema horen bij de huidige metropolitane departementsgeometrie.
const MIN_LON = -5.14127657354623;
const MAX_LON = 9.559807;
const MIN_LAT = 41.33374;
const MAX_LAT = 51.088394;
const BREEDTE = 1000;

const MID_LAT = (MIN_LAT + MAX_LAT) / 2;
const KX = Math.cos((MID_LAT * Math.PI) / 180);
const SCHAAL = BREEDTE / ((MAX_LON - MIN_LON) * KX);

export interface KaartPunt {
  x: number;
  y: number;
}

export function projecteerCoordinaat(longitude: number, latitude: number): KaartPunt {
  return {
    x: (longitude - MIN_LON) * KX * SCHAAL,
    y: (MAX_LAT - latitude) * SCHAAL,
  };
}
