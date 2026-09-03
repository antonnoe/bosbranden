// Leest de vervaldatum uit een API-sleutel, zonder netwerk.
//
// Aliasvrij en zonder framework, zoals lib/rookbeoordeling.ts: zo gebruiken
// zowel /api/status/vervaldata als scripts/key-vervaldatum.ts dezelfde code, en
// kan die code een offline zelftest hebben (scripts/test-vervaldata.ts).
//
// EEN HARDE REGEL. Niets uit deze module geeft de sleutel terug, ook geen deel
// ervan, ook niet in een foutmelding. Wat eruit komt zijn datums en een reden;
// de sleutel zelf blijft binnen de functie. Dat is geen overdreven
// voorzichtigheid: de uitvoer belandt in een publiek endpoint en in logs van
// een monitor, twee plekken waar een sleutel niet hoort en waar hij, eenmaal
// beland, niet meer terug te halen is.

export interface Vervaldatum {
  // ISO-datum, of null wanneer die niet uit de sleutel te lezen is.
  verlooptOp: string | null;
  uitgegevenOp: string | null;
  // Alleen gevuld wanneer verlooptOp null is: waaróm er geen datum is. Nooit
  // met inhoud uit de sleutel erin.
  opmerking?: string;
}

function leesPayload(deel: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(deel, "base64url").toString("utf8");
    const obj: unknown = JSON.parse(json);
    return obj !== null && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function alsDatum(waarde: unknown): Date | null {
  if (typeof waarde !== "number" || !Number.isFinite(waarde)) return null;
  // JWT-claims zijn seconden sinds epoch; sommige uitgevers gebruiken
  // milliseconden. Boven het jaar 3000 in seconden is het dus milliseconden.
  const ms = waarde > 32503680000 ? waarde : waarde * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function leesVervaldatum(sleutel: string | undefined): Vervaldatum {
  if (!sleutel) {
    return {
      verlooptOp: null,
      uitgegevenOp: null,
      opmerking: "De omgevingsvariabele is niet gezet.",
    };
  }

  const delen = sleutel.split(".");
  if (delen.length !== 3) {
    return {
      verlooptOp: null,
      uitgegevenOp: null,
      opmerking:
        "De sleutel is geen JWT, dus er valt lokaal geen vervaldatum uit af te lezen. " +
        "Zoek de geldigheidsduur op in het API-portaal, bij het token-dialoog onder 'Validity period'.",
    };
  }

  const payload = leesPayload(delen[1]);
  if (!payload) {
    return {
      verlooptOp: null,
      uitgegevenOp: null,
      opmerking:
        "De middelste sectie van de sleutel is geen leesbare JSON; waarschijnlijk geen standaard-JWT.",
    };
  }

  const uitgegeven = alsDatum(payload.iat);
  const vervalt = alsDatum(payload.exp);

  if (!vervalt) {
    return {
      verlooptOp: null,
      uitgegevenOp: uitgegeven ? uitgegeven.toISOString() : null,
      opmerking:
        "De sleutel bevat geen exp-claim. Dat betekent niet automatisch dat hij onbeperkt " +
        "geldig is: het portaal kan hem ook buiten de token om intrekken.",
    };
  }

  return {
    verlooptOp: vervalt.toISOString(),
    uitgegevenOp: uitgegeven ? uitgegeven.toISOString() : null,
  };
}

// Hele dagen tot de vervaldatum; negatief wanneer die al is gepasseerd.
// Null wanneer er geen datum is, zodat "onbekend" nooit als "nog lang goed"
// wordt gelezen.
export function dagenTot(isoDatum: string | null, nu: Date = new Date()): number | null {
  if (!isoDatum) return null;
  const d = new Date(isoDatum);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - nu.getTime()) / 86400000);
}
