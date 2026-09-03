// /api/vigilance/debug — toont de werkelijke respons van de Vigilance-API:
// welk basepath antwoordde, de structuurschets en het genormaliseerde
// resultaat. Nodig omdat de responsstructuur van deze API alleen achter het
// ingelogde portaal is gedocumenteerd; zonder deze route zou de normalisatie
// in lib/vigilance.ts een gok blijven. Bevat nooit de API-key.
//
// Zodra de structuur is vastgesteld hoort de bevinding in de README en mag
// lib/vigilance.ts strakker worden gemaakt, zoals bij /api/debug is gebeurd
// toen bleek dat /carte/encours puntkomma-CSV teruggeeft.

import { NextResponse } from "next/server";
import {
  haalRuweVigilanceOp,
  normaliseerVigilance,
  structuurSchets,
  telDepartementen,
} from "@/lib/vigilance";

export const revalidate = 900;

export async function GET() {
  try {
    const { status, body, basispad } = await haalRuweVigilanceOp();

    let raw: unknown = null;
    let leesbaar = false;
    try {
      raw = JSON.parse(body);
      leesbaar = true;
    } catch {
      leesbaar = false;
    }

    const data = leesbaar ? normaliseerVigilance(raw) : null;

    console.log("[vigilance-debug] status:", status, "basispad:", basispad);
    if (leesbaar) {
      console.log(
        "[vigilance-debug] structuur:",
        JSON.stringify(structuurSchets(raw)).slice(0, 4000)
      );
    }

    return NextResponse.json({
      upstreamStatus: status,
      basispad,
      vorm: leesbaar ? "json" : "geen json",
      structuur: leesbaar ? structuurSchets(raw) : body.slice(0, 1000),
      aantalDepartementen: data ? telDepartementen(data) : 0,
      genormaliseerd: data,
    });
  } catch (e) {
    return NextResponse.json(
      { fout: e instanceof Error ? e.message : "Onbekende fout." },
      { status: 500 }
    );
  }
}
