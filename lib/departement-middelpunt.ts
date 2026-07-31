// Geografische middelpunten (breedte-/lengtegraad) per departement, gebruikt om
// "in en rond uw departement" te bepalen: de departementen waarvan het middelpunt
// binnen een straal van het gekozen departement ligt.
//
// GEGENEREERD: het oppervlakte-gewogen zwaartepunt van elke departementsgeometrie
// (lib/kaart-paths.ts) is met de kaartprojectie teruggezet naar lat/lon en hier
// als vaste tabel opgeslagen. Zo hoeft de lichte /start-pagina de volledige
// SVG-geometrie niet in haar bundel te trekken. Regenereren als de geometrie
// wijzigt (dezelfde bron als npm run generate:map).

type Middelpunt = readonly [code: string, latitude: number, longitude: number];

const MIDDELPUNTEN: readonly Middelpunt[] = [
  ["01", 46.0860, 5.3375],
  ["02", 49.5569, 3.5442],
  ["03", 46.3799, 3.1715],
  ["04", 44.0862, 6.2366],
  ["05", 44.6452, 6.2562],
  ["06", 43.9184, 7.1104],
  ["07", 44.7350, 4.4130],
  ["08", 49.6121, 4.6276],
  ["09", 42.8978, 1.4829],
  ["10", 48.2965, 4.1472],
  ["11", 43.0805, 2.3938],
  ["12", 44.2616, 2.6602],
  ["13", 43.5191, 5.0744],
  ["14", 49.0943, -0.3861],
  ["15", 45.0344, 2.6509],
  ["16", 45.7033, 0.1784],
  ["17", 45.7653, -0.7024],
  ["18", 47.0541, 2.4741],
  ["19", 45.3412, 1.8575],
  ["21", 47.4149, 4.7589],
  ["22", 48.4330, -2.8975],
  ["23", 46.0758, 1.9986],
  ["24", 45.0877, 0.7186],
  ["25", 47.1542, 6.3547],
  ["26", 44.6552, 5.1485],
  ["27", 49.1087, 0.9745],
  ["28", 48.3804, 1.3487],
  ["29", 48.2527, -4.0953],
  ["2A", 41.8370, 8.9879],
  ["2B", 42.3695, 9.2060],
  ["30", 43.9732, 4.1665],
  ["31", 43.3367, 1.1518],
  ["32", 43.6714, 0.4295],
  ["33", 44.8067, -0.6012],
  ["34", 43.5576, 3.3522],
  ["35", 48.1466, -1.6662],
  ["36", 46.7657, 1.5561],
  ["37", 47.2471, 0.6683],
  ["38", 45.2471, 5.5647],
  ["39", 46.7172, 5.6876],
  ["40", 43.9454, -0.8103],
  ["41", 47.6069, 1.4081],
  ["42", 45.7122, 4.1515],
  ["43", 45.1106, 3.7918],
  ["44", 47.3520, -1.7077],
  ["45", 47.9034, 2.3257],
  ["46", 44.6061, 1.5850],
  ["47", 44.3481, 0.4373],
  ["48", 44.4983, 3.4835],
  ["49", 47.3799, -0.5850],
  ["50", 49.0757, -1.3573],
  ["51", 48.9434, 4.2256],
  ["52", 48.1014, 5.2142],
  ["53", 48.1389, -0.6830],
  ["54", 48.7815, 6.1535],
  ["55", 48.9856, 5.3705],
  ["56", 47.8382, -2.8430],
  ["57", 49.0317, 6.6530],
  ["58", 47.1042, 3.4889],
  ["59", 50.4457, 3.1995],
  ["60", 49.4053, 2.4074],
  ["61", 48.6158, 0.1033],
  ["62", 50.4903, 2.2718],
  ["63", 45.7106, 3.1239],
  ["64", 43.2341, -0.7820],
  ["65", 43.0305, 0.1396],
  ["66", 42.5751, 2.5010],
  ["67", 48.6645, 7.5472],
  ["68", 47.8500, 7.2678],
  ["69", 45.8564, 4.6285],
  ["70", 47.6315, 6.0785],
  ["71", 46.6320, 4.5303],
  ["72", 47.9860, 0.1991],
  ["73", 45.4617, 6.4349],
  ["74", 46.0204, 6.4201],
  ["75", 48.8499, 2.3257],
  ["76", 49.6512, 1.0054],
  ["77", 48.6203, 2.9170],
  ["78", 48.8088, 1.8220],
  ["79", 46.5439, -0.3434],
  ["80", 49.9550, 2.2573],
  ["81", 43.7646, 2.1466],
  ["82", 44.0658, 1.2598],
  ["83", 43.4205, 6.2362],
  ["84", 43.9861, 5.1665],
  ["85", 46.6624, -1.3257],
  ["86", 46.5519, 0.4355],
  ["87", 45.8776, 1.2125],
  ["88", 48.1878, 6.3728],
  ["89", 47.8308, 3.5478],
  ["90", 47.6222, 6.9205],
  ["91", 48.5145, 2.2240],
  ["92", 48.8418, 2.2271],
  ["93", 48.9112, 2.4599],
  ["94", 48.7703, 2.4500],
  ["95", 49.0771, 2.1118],
];

const AARDE_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return AARDE_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geografisch middelpunt van een departement, of null als de code onbekend is.
export function middelpuntVanDepartement(
  code: string
): { latitude: number; longitude: number } | null {
  const m = MIDDELPUNTEN.find((d) => d[0] === code);
  return m ? { latitude: m[1], longitude: m[2] } : null;
}

// Alle departementen waarvan het middelpunt binnen `km` van het middelpunt van
// `code` ligt (inclusief het departement zelf). Zo dekt "in en rond uw
// departement" ook de buurdepartementen. Valt terug op alleen de eigen code als
// de code onbekend is.
export function departementenBinnenStraal(code: string, km: number): string[] {
  const centrum = MIDDELPUNTEN.find((d) => d[0] === code);
  if (!centrum) return [code];
  const binnen = MIDDELPUNTEN.filter(
    (d) => haversineKm(centrum[1], centrum[2], d[1], d[2]) <= km
  ).map((d) => d[0]);
  return binnen.length ? binnen : [code];
}
