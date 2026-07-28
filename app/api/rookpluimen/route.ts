import { NextRequest, NextResponse } from "next/server";
import {
  bepaalPostcodeAntwoord,
  berekenPluimen,
  type PostcodeAntwoord,
} from "@/lib/rookdrift";

export const runtime = "nodejs";
export const revalidate = 900; // pluimen: 15 minuten (gelijk aan FIRMS)

// Elke bron faalt afzonderlijk; deze route geeft nooit een 500.
export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get("postcode")?.trim() || null;

  let resultaat: Awaited<ReturnType<typeof berekenPluimen>>;
  try {
    resultaat = await berekenPluimen();
  } catch {
    resultaat = {
      beschikbaar: false,
      windBeschikbaar: false,
      bijgewerkt: null,
      startuur: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      opmerking:
        "De berekende windbanen zijn tijdelijk niet beschikbaar. Probeer het over enkele minuten opnieuw.",
      pluimen: [],
    };
  }

  let postcodeAntwoord: PostcodeAntwoord | undefined;
  if (postcode) {
    // Een fout in de postcodeberekening mag de route nooit laten omvallen (500):
    // de kaart en de rest van het antwoord moeten blijven werken.
    try {
      postcodeAntwoord = bepaalPostcodeAntwoord(resultaat.pluimen, postcode, resultaat.startuur);
    } catch {
      postcodeAntwoord = {
        status: "onbekend",
        tekst:
          "De uitkomst voor deze postcode kon nu niet worden berekend. Probeer het over enkele minuten opnieuw.",
      };
    }
  }

  return NextResponse.json(
    {
      ...resultaat,
      ...(postcodeAntwoord ? { postcode: postcodeAntwoord } : {}),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
      },
    }
  );
}
