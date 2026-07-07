// /api/danger — de enige route waarmee de frontend praat.
// Haalt {MF_BASIS}/carte/encours op (cache: 6 uur via Next.js revalidate),
// normaliseert naar { niveaus, bijgewerkt } en geeft nooit de API-key door.

import { NextResponse } from "next/server";
import { haalRuweKaartOp, normaliseer, structuurSchets, CACHE_SECONDEN } from "@/lib/meteofrance";

export const revalidate = 21600; // 6 uur

export async function GET() {
  try {
    const { status, body } = await haalRuweKaartOp();

    if (status !== 200) {
      return NextResponse.json(
        {
          fout: `Météo-France antwoordde met status ${status}.`,
          detail: body.slice(0, 300),
        },
        { status: 502 }
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return NextResponse.json(
        { fout: "Respons van Météo-France is geen JSON.", detail: body.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = normaliseer(raw);
    const aantal = Object.keys(data.niveaus).length;

    if (aantal === 0) {
      // Structuur onbekend gebleken: rapporteer de schets zodat dit direct
      // zichtbaar is (zie ook /api/debug). Buiten het seizoen (okt–mei) kan de
      // API ook een lege kaart teruggeven.
      return NextResponse.json(
        {
          fout: "Geen departementsniveaus gevonden in de respons van Météo-France.",
          opmerking:
            "De Météo des forêts wordt alleen tijdens het seizoen (juni t/m september) dagelijks gepubliceerd. Controleer /api/debug voor de ruwe structuur.",
          structuur: structuurSchets(raw),
          bijgewerkt: data.bijgewerkt,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        niveaus: data.niveaus,
        bijgewerkt: data.bijgewerkt,
        datumJ1: data.datumJ1,
        datumJ2: data.datumJ2,
        aantalDepartementen: aantal,
        bron: "Météo-France — Météo des forêts",
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDEN}, stale-while-revalidate=3600`,
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
