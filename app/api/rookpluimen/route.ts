import { NextRequest, NextResponse } from "next/server";
import {
  bepaalPostcodeAntwoord,
  berekenPluimen,
  haalFijnstofOp,
  type Fijnstof,
  type PostcodeAntwoord,
} from "@/lib/rookdrift";

export const runtime = "nodejs";
export const revalidate = 900; // pluimen: 15 minuten (gelijk aan FIRMS)

// Elke bron faalt afzonderlijk; deze route geeft nooit een 500.
export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get("postcode")?.trim() || null;
  const metFijnstof = request.nextUrl.searchParams.get("fijnstof") === "1";

  const resultaat = await berekenPluimen();

  let fijnstof: Fijnstof | undefined;
  if (metFijnstof) {
    try {
      fijnstof = await haalFijnstofOp(resultaat.startuur);
    } catch {
      fijnstof = undefined;
    }
  }

  let postcodeAntwoord: PostcodeAntwoord | undefined;
  if (postcode) {
    postcodeAntwoord = bepaalPostcodeAntwoord(resultaat.pluimen, postcode, resultaat.startuur);
  }

  return NextResponse.json(
    {
      ...resultaat,
      ...(fijnstof ? { fijnstof } : {}),
      ...(postcodeAntwoord ? { postcode: postcodeAntwoord } : {}),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
      },
    }
  );
}
