// /api/vigilance — de Vigilance-kaart van Météo-France, negen gevaren, het
// hele jaar door. Zusterroute van /api/danger (Météo des forêts), met dezelfde
// harde regel: geen gevonden niveau betekent geen niveau, nooit een ingevuld
// getal en nooit een groene kaart bij gebrek aan data.

import { NextResponse } from "next/server";
import {
  FENOMENEN,
  VIGILANCE_CACHE_SECONDEN,
  VIGILANCE_KLEUREN,
  haalRuweVigilanceOp,
  normaliseerVigilance,
  structuurSchets,
  telDepartementen,
} from "@/lib/vigilance";

export const revalidate = 900; // 15 minuten, zie VIGILANCE_CACHE_SECONDEN

export async function GET() {
  try {
    const { status, body, basispad } = await haalRuweVigilanceOp();

    if (status !== 200) {
      return NextResponse.json(
        {
          fout: `Météo-France (Vigilance) antwoordde met status ${status}.`,
          detail: body.slice(0, 300),
          basispad,
          opmerking:
            status === 401 || status === 403
              ? "De API-key wordt geweigerd. Controleer in het API-portaal of Vigilance Bulletin nog onder dezelfde applicatie hangt en of de key zelf niet is verlopen (npm run key:vervaldatum)."
              : undefined,
        },
        { status: 502 }
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return NextResponse.json(
        {
          fout: "De respons van Vigilance was geen leesbare JSON.",
          detail: body.slice(0, 300),
          basispad,
        },
        { status: 502 }
      );
    }

    const data = normaliseerVigilance(raw);
    const aantal = telDepartementen(data);

    if (aantal === 0) {
      // Structuur onbekend gebleken. Dit expliciet melden is het hele punt:
      // een lege kaart die er groen uitziet zou zeggen "geen gevaar", en dat
      // is precies de bewering die we niet mogen doen zonder data.
      return NextResponse.json(
        {
          fout: "Geen departementsniveaus gevonden in de respons van Vigilance.",
          opmerking:
            "De structuur van deze API is niet publiek gedocumenteerd. Zie /api/vigilance/debug voor de ruwe vorm.",
          basispad,
          structuur: structuurSchets(raw),
          bijgewerkt: data.bijgewerkt,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        departementen: data.departementen,
        bijgewerkt: data.bijgewerkt,
        aantalDepartementen: aantal,
        fenomenen: FENOMENEN,
        kleuren: VIGILANCE_KLEUREN,
        basispad,
        bron: "Météo-France — Vigilance",
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${VIGILANCE_CACHE_SECONDEN}, stale-while-revalidate=3600`,
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { fout: e instanceof Error ? e.message : "Onbekende fout." },
      { status: 500 }
    );
  }
}
