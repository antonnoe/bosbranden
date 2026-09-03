// /api/vigilance/debug — toont de werkelijke respons van de Vigilance-API:
// structuurschets, het genormaliseerde resultaat en welke fenomeen-ID's er
// werkelijk in voorkwamen. Nodig omdat de responsstructuur van deze API alleen
// achter het ingelogde portaal is gedocumenteerd, en omdat de ID-tabel in
// lib/vigilance-normalisatie.ts alleen te toetsen is tegen wat er binnenkomt.
//
// DEZE ROUTE HOORT NIET OP PRODUCTIE. Ze vertelt een bezoeker of de sleutel
// wordt geaccepteerd en welke upstream-status Météo-France teruggaf; dat is
// diagnostiek over onze eigen configuratie, geen publieke informatie. Daarom
// twee sloten die allebei dicht moeten staan om hem te openen:
//
//   1. VIGILANCE_DEBUG=1 moet expliciet gezet zijn. Ontbreekt de variabele,
//      dan is de route dicht — fail-closed, niet fail-open.
//   2. Ook mét die vlag blijft hij dicht wanneer VERCEL_ENV "production" is.
//      Eén verkeerd aangevinkt vakje in het Vercel-scherm zou anders genoeg
//      zijn, en dat is een te dunne bescherming voor het enige eindpunt dat
//      iets over de sleutel prijsgeeft.
//
// Dicht betekent 404 en niet 403: een 403 bevestigt dat de route bestaat.

import { NextResponse } from "next/server";
import {
  VIGILANCE_BASIS,
  VIGILANCE_DEKKING,
  VIGILANCE_PAD,
  haalRuweVigilanceOp,
  normaliseerVigilance,
  structuurSchets,
  telDepartementen,
  waargenomenFenomenen,
} from "@/lib/vigilance";

// force-dynamic, en dat is hier een beveiligingskeuze en geen prestatiekeuze.
// Zonder deze regel prerendert Next deze route statisch en wordt de vlag
// hieronder één keer op buildtijd gelezen; de uitkomst ligt dan vast in het
// gebouwde bestand. Een vlag die je later wijzigt zou dan niets doen, en erger:
// een build die per ongeluk mét de vlag draait, levert een permanent open
// route op. Nu wordt bij elke request opnieuw gekeken.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function debugToegestaan(): boolean {
  return process.env.VIGILANCE_DEBUG === "1" && process.env.VERCEL_ENV !== "production";
}

export async function GET() {
  if (!debugToegestaan()) {
    return NextResponse.json({ fout: "Niet gevonden." }, { status: 404 });
  }

  try {
    const { status, body } = await haalRuweVigilanceOp();

    let raw: unknown = null;
    let leesbaar = false;
    try {
      raw = JSON.parse(body);
      leesbaar = true;
    } catch {
      leesbaar = false;
    }

    const data = leesbaar ? normaliseerVigilance(raw) : null;

    return NextResponse.json({
      endpoint: `${VIGILANCE_BASIS}${VIGILANCE_PAD}`,
      upstreamStatus: status,
      dekking: VIGILANCE_DEKKING,
      vorm: leesbaar ? "json" : "geen json",
      structuur: leesbaar ? structuurSchets(raw) : body.slice(0, 1000),
      aantalDepartementen: data ? telDepartementen(data) : 0,
      // Het gereedschap om de ID-tabel te toetsen: verschijnt er bij een
      // winterse storm een ID 5 in de Alpen, dan is "sneeuw en ijzel"
      // bevestigd en kan `bevestigd` in FENOMENEN op true.
      waargenomenFenomenen: data ? waargenomenFenomenen(data) : [],
      genormaliseerd: data,
    });
  } catch (e) {
    return NextResponse.json(
      { fout: e instanceof Error ? e.message : "Onbekende fout." },
      { status: 500 }
    );
  }
}
