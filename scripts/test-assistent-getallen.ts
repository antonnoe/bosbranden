// Offline zelftest voor de cijfer-/datumcontrole van de "Leg uit"-uitvoer (fix 4).
// Geen netwerk, geen model, geen DOM nodig.
// Draaien:  node --experimental-strip-types scripts/test-assistent-getallen.ts
//
// Bewijst dat een antwoord met een verzonnen datum ("35 april"), een verzonnen
// MW-waarde (40 MW) of een verzonnen getal wordt afgekeurd, terwijl een antwoord
// dat alleen getallen en datums uit de context gebruikt — of helemaal geen
// getallen — wordt goedgekeurd. Exit-code 1 bij een gefaalde assertie.

import assert from "node:assert/strict";
import { bevatOnbekendeGetallen } from "../lib/assistent-getallen.ts";

// Context zoals bouwUitlegContext die opbouwt voor één losse meting.
const context = [
  "CONTEXT (één satellietmeting om te duiden):",
  "- Type: één losse satellietmeting.",
  "- Departement: Var.",
  "- Tijdstip van de meting: 31 juli 2026 om 14:25.",
  "- Gemeten warmtevermogen (FRP): 35.2 MW.",
  "- Grootteorde: 35.2 MW — beperkt van omvang.",
  "- Betrouwbaarheid van de meting: nominaal.",
  "- Clusterstatus: losse meting, hoort niet bij een samenhangend cluster.",
].join("\n");

// 1. "35 april" — verzonnen datum: de maand april staat niet in de context.
assert.equal(
  bevatOnbekendeGetallen(
    "Op 35 april is een warmtebron in de Var gemeten van ongeveer 35 MW.",
    context
  ),
  true,
  "een verzonnen maand (april, niet in de context) moet worden afgekeurd"
);

// 2. "31 juli" die wél in de context staat, met getallen uit de context.
assert.equal(
  bevatOnbekendeGetallen(
    "De meting is van 31 juli 2026 en betreft ongeveer 35 MW; dat is beperkt van omvang.",
    context
  ),
  false,
  "een datum en getallen die letterlijk in de context staan zijn geldig"
);

// 3. Verzonnen MW-waarde: 40 komt niet in de context voor.
assert.equal(
  bevatOnbekendeGetallen("Het gemeten warmtevermogen is ongeveer 40 MW.", context),
  true,
  "een getal (40) dat niet in de context staat moet worden afgekeurd"
);

// 4. Antwoord zonder getallen of datums: altijd geldig.
assert.equal(
  bevatOnbekendeGetallen(
    "Dit is een waarneming van warmte, geen bevestigde brand. Industriële warmtebronnen worden niet uitgesloten.",
    context
  ),
  false,
  "een antwoord zonder getallen of datums is geldig"
);

// Extra: afgeronde weergave (35) van een precieze contextwaarde (35,2) is geldig.
assert.equal(
  bevatOnbekendeGetallen("Ongeveer 35 MW, gemeten op 31 juli 2026.", context),
  false,
  "een afgerond getal dat overeenkomt met een contextwaarde is geldig"
);

console.log("✓ alle assistent-getallen-tests geslaagd");
