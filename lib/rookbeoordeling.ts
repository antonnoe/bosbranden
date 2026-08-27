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

// Structureel compatibel met Waarneming (lib/waarnemingen.ts). Bewust een eigen,
// minimale vorm: zo hoeft dit bestand niets te importeren.
export interface BeoordeeldeMeting {
  waarschijnlijkNatuurbrand: boolean;
  waarschijnlijkheidsRedenen: string[];
}

export interface Clusterbeoordeling {
  waarschijnlijkNatuurbrand: boolean;
  natuurbrandDetecties: number; // hoeveel metingen de drempel haalden
  signalen: string[]; // ontdubbelde redenen, meest voorkomende eerst
}

// Een cluster telt als waarschijnlijke natuurbrand zodra ÉÉN meting de drempel
// haalt. Dat is bewust asymmetrisch. De classificatie in firms.ts is al streng
// (ze eist samenhang in ruimte én tijd bovenop een sterk signaal), en de fout die
// hier pijn doet is de omgekeerde: een echte natuurbrand niet markeren. Ruimer
// markeren kost hooguit aandacht; krapper markeren kost vertrouwen.
//
// De signalen komen alleen van de metingen die de drempel haalden. Zouden we ze
// van alle metingen verzamelen, dan vulde de lijst zich met redenen van juist de
// metingen die niet meetelden — en dan onderbouwt de tekst iets anders dan het
// oordeel erboven.
//
// Volgorde: hoe vaker een reden voorkomt hoe hoger, bij gelijk aantal
// alfabetisch. Die tweede sleutel is er niet voor de schoonheid: de route cachet
// haar antwoord, dus dezelfde invoer moet altijd dezelfde uitvoer geven.
export function vatBeoordelingSamen(metingen: BeoordeeldeMeting[]): Clusterbeoordeling {
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
    waarschijnlijkNatuurbrand: natuurbrandDetecties > 0,
    natuurbrandDetecties,
    signalen,
  };
}
