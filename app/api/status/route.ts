import { NextResponse } from "next/server";
import { NIVEAUS } from "@/lib/niveaus";
import { DEP_BY_CODE } from "@/lib/departements";
import { isNuActueel, type FrAlertMelding } from "@/lib/fr-alert";

export const runtime = "nodejs";
export const revalidate = 300; // 5 minuten

export type Ernst = 0 | 1 | 2 | 3 | 4;

export interface ModuleStatus {
  id: string;
  ernst: Ernst;
  samenvatting: string;
  beschikbaar: boolean;
}

// Elke module leest zijn eigen bestaande interne route. Faalt er één, dan geeft
// die module beschikbaar:false met een nette tekst — nooit een verzonnen of naar
// nul afgerond getal, en de route zelf geeft nooit een 500.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const [brandgevaar, hittebronnen, rook, waarschuwingen] = await Promise.all([
    statusBrandgevaar(origin),
    statusHittebronnen(origin),
    statusRook(origin),
    statusWaarschuwingen(origin),
  ]);

  return NextResponse.json(
    {
      bijgewerkt: new Date().toISOString(),
      modules: [brandgevaar, hittebronnen, rook, waarschuwingen],
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

async function haalJson(origin: string, pad: string): Promise<unknown | null> {
  try {
    const res = await fetch(new URL(pad, origin), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    // Ook een 502 kan bruikbare JSON bevatten (fallback-vorm); we parsen defensief.
    return await res.json();
  } catch {
    return null;
  }
}

function nietBeschikbaar(id: string, tekst: string): ModuleStatus {
  return { id, ernst: 0, samenvatting: tekst, beschikbaar: false };
}

// ---- Brandgevaar (via /api/danger) ----
async function statusBrandgevaar(origin: string): Promise<ModuleStatus> {
  const json = (await haalJson(origin, "/api/danger")) as
    | { niveaus?: Record<string, { j1: number | null; j2: number | null }>; bijgewerkt?: string | null }
    | null;

  if (!json || !json.niveaus || Object.keys(json.niveaus).length === 0) {
    return nietBeschikbaar(
      "brandgevaar",
      "Het gevaarniveau is nu niet beschikbaar. Buiten het seizoen (juni t/m september) publiceert Météo-France geen dagelijkse kaart."
    );
  }

  let hoogste = 0;
  let aantalOpHoogste = 0;
  for (const dep of Object.values(json.niveaus)) {
    const j1 = dep.j1 ?? 0;
    if (j1 > hoogste) {
      hoogste = j1;
      aantalOpHoogste = 1;
    } else if (j1 === hoogste && j1 > 0) {
      aantalOpHoogste += 1;
    }
  }

  const naam = NIVEAUS[hoogste]?.nl ?? "onbekend";
  const verouderd =
    json.bijgewerkt && Date.now() - Date.parse(json.bijgewerkt) > 12 * 3_600_000;

  const samenvatting =
    hoogste > 0
      ? `Hoogste niveau morgen: ${naam} (${hoogste}) in ${aantalOpHoogste} ${
          aantalOpHoogste === 1 ? "departement" : "departementen"
        }.${verouderd ? " Let op: deze data is ouder dan 12 uur." : ""}`
      : `Geen verhoogd gevaarniveau voor morgen.${
          verouderd ? " Let op: deze data is ouder dan 12 uur." : ""
        }`;

  return { id: "brandgevaar", ernst: (hoogste as Ernst) ?? 0, samenvatting, beschikbaar: true };
}

// ---- Hittebronnen (via /api/waarnemingen) ----
async function statusHittebronnen(origin: string): Promise<ModuleStatus> {
  const json = (await haalJson(origin, "/api/waarnemingen")) as
    | {
        beschikbaar?: boolean;
        waarnemingen?: Array<{ departementCode: string }>;
        opmerking?: string;
      }
    | null;

  if (!json || !json.beschikbaar || !Array.isArray(json.waarnemingen)) {
    return nietBeschikbaar(
      "hittebronnen",
      json?.opmerking ?? "Satellietwaarnemingen zijn nu niet beschikbaar."
    );
  }

  const aantal = json.waarnemingen.length;
  if (aantal === 0) {
    return {
      id: "hittebronnen",
      ernst: 0,
      samenvatting: "Geen hittebronnen gedetecteerd in de afgelopen 24 uur.",
      beschikbaar: true,
    };
  }

  const zwaarste = meestVoorkomend(json.waarnemingen.map((w) => w.departementCode));
  const naam = zwaarste ? DEP_BY_CODE[zwaarste]?.naam ?? `departement ${zwaarste}` : null;

  const ernst: Ernst = aantal > 200 ? 4 : aantal > 50 ? 3 : aantal > 10 ? 2 : 1;
  return {
    id: "hittebronnen",
    ernst,
    samenvatting: `${aantal} detecties in 24 uur${naam ? `, zwaarst getroffen: ${naam}` : ""}.`,
    beschikbaar: true,
  };
}

// ---- Rook (via /api/rookpluimen) ----
async function statusRook(origin: string): Promise<ModuleStatus> {
  const json = (await haalJson(origin, "/api/rookpluimen")) as
    | {
        beschikbaar?: boolean;
        windBeschikbaar?: boolean;
        pluimen?: Array<{ richting: string }>;
        opmerking?: string;
      }
    | null;

  if (!json || !json.beschikbaar || !Array.isArray(json.pluimen)) {
    return nietBeschikbaar(
      "rook",
      json?.opmerking ?? "De rookberekening is nu niet beschikbaar."
    );
  }

  const aantal = json.pluimen.length;
  if (aantal === 0) {
    return {
      id: "rook",
      ernst: 0,
      samenvatting:
        json.opmerking ?? "Geen pluimen: er zijn geen hittebronnen om vanaf te tekenen.",
      beschikbaar: true,
    };
  }

  if (!json.windBeschikbaar) {
    return {
      id: "rook",
      ernst: (aantal > 15 ? 4 : aantal > 8 ? 3 : aantal > 3 ? 2 : 1) as Ernst,
      samenvatting: `${aantal} hittebronnen; de windbanen zijn tijdelijk niet beschikbaar.`,
      beschikbaar: true,
    };
  }

  const richting = meestVoorkomend(
    json.pluimen.map((p) => p.richting).filter((r): r is string => Boolean(r))
  );
  const ernst: Ernst = aantal > 15 ? 4 : aantal > 8 ? 3 : aantal > 3 ? 2 : 1;
  return {
    id: "rook",
    ernst,
    samenvatting: `${aantal} ${aantal === 1 ? "pluim" : "pluimen"}${
      richting ? `, overwegend richting ${richting}` : ""
    }.`,
    beschikbaar: true,
  };
}

// ---- Officiële meldingen (via /api/fr-alert) ----
async function statusWaarschuwingen(origin: string): Promise<ModuleStatus> {
  const json = (await haalJson(origin, "/api/fr-alert")) as
    | {
        beschikbaar?: boolean;
        meldingen?: FrAlertMelding[];
        liveBron?: boolean;
        opmerking?: string;
      }
    | null;

  if (!json || !json.beschikbaar || !Array.isArray(json.meldingen)) {
    return nietBeschikbaar(
      "waarschuwingen",
      json?.opmerking ?? "Officiële meldingen zijn nu niet beschikbaar."
    );
  }

  // FR-Alert publiceert met vertraging; de ernst blijft 0 zolang er niets loopt.
  // We melden de laatste stand in plaats van "geen actuele melding".
  const lopend = json.meldingen.filter(isNuActueel).length;
  const laatstBekend = json.liveBron === false;
  const laatste = json.meldingen[0]?.begonnenOp ?? null;
  const ernst: Ernst = lopend > 5 ? 4 : lopend > 2 ? 3 : lopend > 0 ? 2 : 0;

  const kern =
    lopend > 0
      ? `${lopend} lopende officiële ${lopend === 1 ? "melding" : "meldingen"}.${
          laatste ? ` Laatste melding: ${formatteerTijd(laatste)}.` : ""
        }`
      : laatste
        ? `Geen lopende meldingen. Laatste officiële melding: ${formatteerTijd(laatste)}.`
        : "Geen recente officiële melding gevonden.";

  return {
    id: "waarschuwingen",
    ernst,
    samenvatting: `${kern}${laatstBekend ? " Laatst bekende stand — geen live gegevens." : ""}`,
    beschikbaar: true,
  };
}

function formatteerTijd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

function meestVoorkomend(waarden: string[]): string | null {
  const telling = new Map<string, number>();
  for (const w of waarden) telling.set(w, (telling.get(w) ?? 0) + 1);
  let beste: string | null = null;
  let max = 0;
  for (const [w, n] of telling) {
    if (n > max) {
      max = n;
      beste = w;
    }
  }
  return beste;
}
