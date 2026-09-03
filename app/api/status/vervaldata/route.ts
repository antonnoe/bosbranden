// /api/status/vervaldata — wat er een keer verloopt, machineleesbaar.
//
// Bedoeld om door een monitor te worden opgevraagd, zodat een verlopende
// sleutel of een aflopend abonnement opvalt vóórdat de tool stilvalt, in plaats
// van erna. Zonder dit endpoint zou iemand die datums met de hand moeten
// bijhouden in de README, en dat is precies het soort onderhoud dat in februari
// niet gebeurt.
//
// WAT HIER NOOIT IN KOMT. De sleutel zelf, of enig deel ervan, in de response,
// in een foutmelding of in de logs. lib/sleutel-vervaldatum.ts geeft alleen
// datums en een reden terug; de sleutel verlaat die module niet. Dat is nodig
// omdat dit endpoint publiek is: het vertelt wanneer een sleutel verloopt, wat
// metadata is, maar mag nooit vertellen wat de sleutel ís.
//
// Niet cachen: `dagenTot` verandert elke dag, en een gecachet antwoord zou een
// monitor een bevroren teller voorschotelen die nooit onder de drempel zakt.

import { NextResponse } from "next/server";
import { ABONNEMENTEN, AFGELEZEN_OP, PORTAAL_APPLICATIE } from "@/data/vervaldata";
import { dagenTot, leesVervaldatum } from "@/lib/sleutel-vervaldatum";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const sleutel = leesVervaldatum(process.env.METEOFRANCE_API_KEY);

  return NextResponse.json(
    {
      sleutel: {
        bron: "METEOFRANCE_API_KEY",
        verlooptOp: sleutel.verlooptOp,
        uitgegevenOp: sleutel.uitgegevenOp,
        dagenTot: dagenTot(sleutel.verlooptOp),
        ...(sleutel.opmerking ? { opmerking: sleutel.opmerking } : {}),
      },
      abonnementen: ABONNEMENTEN.map((a) => ({
        ...a,
        dagenTot: dagenTot(a.eindigtOp),
      })),
      portaal: {
        applicatie: PORTAAL_APPLICATIE,
        afgelezenOp: AFGELEZEN_OP,
        // De derde klok, die geen datum heeft maar wel een oorzaak. Een sleutel
        // dekt alleen de API's waarop de applicatie geabonneerd was toen hij
        // werd gegenereerd; na een nieuwe subscription moet er dus een nieuwe
        // sleutel komen, ook al loopt het abonnement nog jaren door.
        let: "Na elke nieuwe subscription een nieuwe sleutel genereren en in Vercel zetten.",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
