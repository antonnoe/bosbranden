// Samenvatten van de per-detectie beoordeling op clusterniveau.
//
// Apart bestand, en met opzet framework- én aliasvrij: lib/rookdrift.ts kan
// alleen binnen Next draaien (het importeert via "@/…"), waardoor de logica daar
// niet los te testen valt. Dit is dezelfde scheiding als bij nieuws-thema.ts en
// feedcontrole-logica.mjs: het oordeel staat apart, zodat het een zelftest kan
// hebben. Zie scripts/test-rookbeoordeling.ts.
//
// De beoordeling zelf wordt NIET hier gemaakt — die komt uit
// classificeerWaarnemingen() in lib/firms.ts en draaide al voor de brandkaart.
// Hier wordt ze alleen samengevat over de detecties van één cluster.

import { isSchuurFormaat } from "./frp-schaal.ts";

// Structureel compatibel met Waarneming (lib/waarnemingen.ts). Bewust een eigen,
// minimale vorm, zodat dit bestand niets uit de Next-boom hoeft te importeren.
export interface BeoordeeldeMeting {
  waarschijnlijkNatuurbrand: boolean;
  waarschijnlijkheidsRedenen: string[];
}

export interface Clusterbeoordeling {
  waarschijnlijkNatuurbrand: boolean;
  natuurbrandDetecties: number; // hoeveel metingen de drempel haalden
  signalen: string[]; // ontdubbelde redenen, meest voorkomende eerst
}

// TWEE POORTEN, en ze doen verschillend werk.
//
// 1. De FRP-poort. Valt het cluster in de kleinste band van de FRP-schaal
//    (onder FRP_KLEIN_MAX_MW, zie lib/frp-schaal.ts), dan krijgt het NOOIT de
//    markering — hoe overtuigend de detectiesignalen ook zijn. Die grens is
//    hier niet verzonnen: het is dezelfde band waarin de tool zo'n bron zelf
//    "klein, vergelijkbaar met een brandende schuur of een klein perceel"
//    noemt. Zonder deze poort kreeg een bron van 7,1 MW de kop "waarschijnlijke
//    natuurbrand", met daaronder in dezelfde popup de zin dat het schuur-
//    formaat is. Een markering die zichzelf tegenspreekt is erger dan geen
//    markering: ze leert de lezer haar te negeren.
//    Een ONBEKENDE FRP telt niet als klein — zie isSchuurFormaat.
//
// 2. De detectiepoort. Bóven die grens telt het cluster als waarschijnlijke
//    natuurbrand zodra ÉÉN meting de drempel haalt. Dat is bewust asymmetrisch:
//    de classificatie in firms.ts is al streng (samenhang in ruimte én tijd
//    bovenop een sterk signaal), en de fout die daar pijn doet is de omgekeerde
//    — een echte natuurbrand niet markeren.
//
// De twee poorten samen: de FRP-schaal bepaalt of er überhaupt iets te melden
// valt, de detectiesignalen bepalen of het te melden valt als natuurbrand.
//
// De signalen komen alleen van de metingen die de drempel haalden. Zouden we ze
// van alle metingen verzamelen, dan vulde de lijst zich met redenen van juist de
// metingen die niet meetelden — en dan onderbouwt de tekst iets anders dan het
// oordeel erboven.
//
// Volgorde: hoe vaker een reden voorkomt hoe hoger, bij gelijk aantal
// alfabetisch. Die tweede sleutel is er niet voor de schoonheid: de route cachet
// haar antwoord, dus dezelfde invoer moet altijd dezelfde uitvoer geven.
export function vatBeoordelingSamen(
  metingen: BeoordeeldeMeting[],
  clusterFrp: number | null | undefined
): Clusterbeoordeling {
  let natuurbrandDetecties = 0;
  const telling = new Map<string, number>();

  for (const meting of metingen) {
    if (!meting.waarschijnlijkNatuurbrand) continue;
    natuurbrandDetecties += 1;
    for (const reden of meting.waarschijnlijkheidsRedenen) {
      telling.set(reden, (telling.get(reden) ?? 0) + 1);
    }
  }

  const signalen = [...telling.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nl"))
    .map(([reden]) => reden);

  return {
    waarschijnlijkNatuurbrand: natuurbrandDetecties > 0 && !isSchuurFormaat(clusterFrp),
    natuurbrandDetecties,
    signalen,
  };
}
