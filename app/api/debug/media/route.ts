// /api/debug/media — laat zien wáár de keten "satellietmelding → persbericht"
// stopt. Zelfde bedoeling als /api/debug: een aangenomen responsvorm verifiëren
// tegen de werkelijkheid, in plaats van erop te vertrouwen.
//
// WAAROM DEZE ROUTE BESTAAT. De mediakoppeling kent één vervelende eigenschap:
// "geen treffers" is de normale toestand én de vorm waarin élke storing zich
// voordoet. Antwoordt de geocoder anders dan wij aannemen, dan koppelt de tool
// structureel nooit iets en ziet dat er van buiten precies zo uit als een
// rustige dag. Deze route maakt dat verschil zichtbaar.
//
// Lees de uitkomst zo:
//   feeds[].naZeef  — laat de onderwerpzeef iets door? Overal 0 = er is geen
//                     natuurbrandnieuws, en dan is er ook niets te koppelen.
//   berichten[].plaatsnamen — herkent de kop een gemeente? Leeg bij elk bericht
//                     terwijl er wél koppen zijn = de naamherkenning faalt.
//   geocoderProef   — DE KERNPROEF. Een gemeente waarvan we weten dat hij
//                     bestaat. Staan er bij eersteProperties geen `score` en
//                     `citycode`, of is aantalFeatures 0, dan klopt onze aanname
//                     over de geocoder niet en koppelt de keten nooit iets.
//
// Bevat geen sleutels; alle bevraagde diensten zijn vrij toegankelijk.

import { NextRequest, NextResponse } from "next/server";
import { diagnoseMediaketen } from "@/lib/mediatreffers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // ?naam=… om een andere gemeente te proberen dan de standaardproef.
  const naam = request.nextUrl.searchParams.get("naam")?.trim() || undefined;

  try {
    return NextResponse.json(await diagnoseMediaketen(naam), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (fout) {
    return NextResponse.json(
      { fout: fout instanceof Error ? fout.message : "Onbekende fout." },
      { status: 500 }
    );
  }
}
