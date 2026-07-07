// /api/debug — testroute om de werkelijke responsstructuur van
// {MF_BASIS}/carte/encours te verifiëren (de swagger is alleen via het
// ingelogde Météo-France-portaal beschikbaar). Geeft een structuurschets
// (sleutels + types + 2 voorbeelditems per array) terug en logt die ook.
// Bevat nooit de API-key. De data zelf valt onder de Etalab licence ouverte.

import { NextResponse } from "next/server";
import { haalRuweKaartOp, normaliseer, structuurSchets } from "@/lib/meteofrance";

export const revalidate = 21600;

export async function GET() {
  try {
    const { status, body } = await haalRuweKaartOp();
    let raw: unknown = null;
    let json = true;
    try {
      raw = JSON.parse(body);
    } catch {
      json = false;
    }
    const schets = json ? structuurSchets(raw) : body.slice(0, 2000);
    console.log("[debug] /carte/encours status:", status);
    console.log("[debug] structuur:", JSON.stringify(schets).slice(0, 4000));
    return NextResponse.json({
      upstreamStatus: status,
      isJson: json,
      structuur: schets,
      genormaliseerd: json ? normaliseer(raw) : null,
    });
  } catch (e) {
    return NextResponse.json(
      { fout: e instanceof Error ? e.message : "Onbekende fout." },
      { status: 500 }
    );
  }
}
