import { NextRequest, NextResponse } from "next/server";
import {
  bepaalPostcodeAntwoord,
  berekenPluimen,
  type PostcodeAntwoord,
} from "@/lib/rookdrift";
import { zoekMediatreffers } from "@/lib/mediatreffers";

export const runtime = "nodejs";
export const revalidate = 900; // pluimen: 15 minuten (gelijk aan FIRMS)
// De mediakoppeling haalt zes feeds op en bevraagt de geocoder; beide zijn
// gecachet, maar een koude aanvraag mag niet tegen de standaardlimiet lopen.
export const maxDuration = 30;

// Elke bron faalt afzonderlijk; deze route geeft nooit een 500.
export async function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get("postcode")?.trim() || null;

  let resultaat: Awaited<ReturnType<typeof berekenPluimen>>;
  try {
    resultaat = await berekenPluimen();
  } catch {
    resultaat = {
      beschikbaar: false,
      windBeschikbaar: false,
      bijgewerkt: null,
      startuur: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      opmerking:
        "De berekende windbanen zijn tijdelijk niet beschikbaar. Probeer het over enkele minuten opnieuw.",
      pluimen: [],
    };
  }

  // Persbevestiging erbij zoeken. Alléén bij haarden die de brandbeoordeling
  // heeft gemarkeerd: de trigger is de satellietmelding, niet het nieuws. Een
  // storing hierin mag de kaart nooit raken, vandaar de eigen try/catch bovenop
  // die van zoekMediatreffers zelf.
  try {
    const gemarkeerd = resultaat.pluimen
      .map((pluim, index) => ({ pluim, index }))
      .filter(({ pluim }) => pluim.waarschijnlijkNatuurbrand);

    if (gemarkeerd.length > 0) {
      const treffers = await zoekMediatreffers(
        gemarkeerd.map(({ pluim }) => ({
          lat: pluim.lat,
          lon: pluim.lon,
          departementCode: pluim.bronDepartementCode,
          laatsteDetectie: pluim.laatsteDetectie,
        }))
      );
      if (treffers.size > 0) {
        const pluimen = [...resultaat.pluimen];
        treffers.forEach((treffer, positie) => {
          const doel = gemarkeerd[positie];
          if (doel) pluimen[doel.index] = { ...doel.pluim, media: treffer };
        });
        resultaat = { ...resultaat, pluimen };
      }
    }
  } catch {
    // Geen bevestiging is de normale toestand; nooit een reden om te falen.
  }

  let postcodeAntwoord: PostcodeAntwoord | undefined;
  if (postcode) {
    // Een fout in de postcodeberekening mag de route nooit laten omvallen (500):
    // de kaart en de rest van het antwoord moeten blijven werken.
    try {
      postcodeAntwoord = bepaalPostcodeAntwoord(resultaat.pluimen, postcode, resultaat.startuur);
    } catch {
      postcodeAntwoord = {
        status: "onbekend",
        tekst:
          "De uitkomst voor deze postcode kon nu niet worden berekend. Probeer het over enkele minuten opnieuw.",
      };
    }
  }

  return NextResponse.json(
    {
      ...resultaat,
      ...(postcodeAntwoord ? { postcode: postcodeAntwoord } : {}),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
      },
    }
  );
}
