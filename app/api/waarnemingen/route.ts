import { NextResponse } from "next/server";
import { haalFirmsWaarnemingenOp } from "@/lib/firms";

export const revalidate = 900; // 15 minuten

export async function GET() {
  const mapKey = process.env.FIRMS_MAP_KEY?.trim();

  if (!mapKey) {
    return NextResponse.json({
      beschikbaar: false,
      waarnemingen: [],
      bijgewerkt: null,
      bron: "NASA FIRMS — VIIRS",
      periodeUren: 24,
      opmerking: "Actuele satellietwaarnemingen zijn tijdelijk niet beschikbaar.",
    });
  }

  try {
    const resultaat = await haalFirmsWaarnemingenOp(mapKey);

    return NextResponse.json(
      {
        beschikbaar: true,
        waarnemingen: resultaat.waarnemingen,
        bijgewerkt: resultaat.bijgewerkt,
        bron: "NASA FIRMS — VIIRS",
        periodeUren: resultaat.periodeUren,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        beschikbaar: false,
        waarnemingen: [],
        bijgewerkt: null,
        bron: "NASA FIRMS — VIIRS",
        periodeUren: 24,
        fout: e instanceof Error ? e.message : "Onbekende fout.",
        opmerking: "Actuele satellietwaarnemingen zijn tijdelijk niet beschikbaar.",
      },
      { status: 502 }
    );
  }
}
