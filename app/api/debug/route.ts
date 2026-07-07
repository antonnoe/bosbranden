// /api/debug — testroute om de werkelijke respons van {MF_BASIS}/carte/encours
// te verifiëren. Geverifieerd (07-07-2026): de respons is puntkomma-CSV met
// kolommen reference_time;dep_code;niveau_j1;niveau_j2;dep_nom.
// Deze route toont de vorm (csv/json), de eerste regels resp. een
// structuurschets, en het genormaliseerde resultaat. Bevat nooit de API-key.

import { NextResponse } from "next/server";
import { haalRuweKaartOp, verwerkBody, structuurSchets } from "@/lib/meteofrance";

export const revalidate = 21600;

export async function GET() {
  try {
    const { status, body } = await haalRuweKaartOp();
    const { vorm, raw, data } = verwerkBody(body);
    const structuur = vorm === "json" ? structuurSchets(raw) : raw;
    console.log("[debug] /carte/encours status:", status, "vorm:", vorm);
    console.log("[debug] structuur:", JSON.stringify(structuur).slice(0, 4000));
    return NextResponse.json({
      upstreamStatus: status,
      vorm,
      structuur,
      genormaliseerd: data,
    });
  } catch (e) {
    return NextResponse.json(
      { fout: e instanceof Error ? e.message : "Onbekende fout." },
      { status: 500 }
    );
  }
}
