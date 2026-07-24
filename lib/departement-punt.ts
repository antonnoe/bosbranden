import { KAART_PADEN } from "@/lib/kaart-paths";
import { projecteerCoordinaat, type KaartPunt } from "@/lib/kaart-projectie";

type Ring = KaartPunt[];

const RINGEN_PER_DEPARTEMENT = KAART_PADEN.map((pad) => ({
  code: pad.code,
  ringen: parseRingen(pad.d),
}));

function parseRingen(d: string): Ring[] {
  const ringen: Ring[] = [];

  for (const match of d.matchAll(/M([^Z]+)Z/g)) {
    const getallen = match[1].match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const ring: Ring = [];

    for (let i = 0; i + 1 < getallen.length; i += 2) {
      ring.push({ x: getallen[i], y: getallen[i + 1] });
    }

    if (ring.length >= 3) ringen.push(ring);
  }

  return ringen;
}

function puntInRing(punt: KaartPunt, ring: Ring): boolean {
  let binnen = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const kruist =
      a.y > punt.y !== b.y > punt.y &&
      punt.x < ((b.x - a.x) * (punt.y - a.y)) / (b.y - a.y) + a.x;

    if (kruist) binnen = !binnen;
  }

  return binnen;
}

function puntInDepartement(punt: KaartPunt, ringen: Ring[]): boolean {
  // Even-odd-regel: werkt zowel voor losse polygonen als voor binnenringen.
  let binnen = false;
  for (const ring of ringen) {
    if (puntInRing(punt, ring)) binnen = !binnen;
  }
  return binnen;
}

export function vindDepartementCode(latitude: number, longitude: number): string | null {
  const punt = projecteerCoordinaat(longitude, latitude);

  for (const departement of RINGEN_PER_DEPARTEMENT) {
    if (puntInDepartement(punt, departement.ringen)) return departement.code;
  }

  return null;
}
