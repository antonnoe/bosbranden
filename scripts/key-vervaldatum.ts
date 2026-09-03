// Leest de vervaldatum van METEOFRANCE_API_KEY, lokaal en zonder netwerk.
// Draaien:  METEOFRANCE_API_KEY=… npm run key:vervaldatum
//
// Voor dagelijks gebruik is /api/status/vervaldata handiger: dat leest dezelfde
// gegevens uit dezelfde module en is door een monitor op te vragen zonder
// terminal. Dit script blijft bestaan voor het geval je een sleutel wilt
// nakijken die nog nergens is uitgerold.
//
// Het drukt de sleutel nooit af, ook niet gedeeltelijk en ook niet bij een
// fout; lib/sleutel-vervaldatum.ts geeft alleen datums terug.

import { dagenTot, leesVervaldatum } from "../lib/sleutel-vervaldatum.ts";

const uitslag = leesVervaldatum(process.env.METEOFRANCE_API_KEY);

function nl(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

console.log("Vervaldatum van METEOFRANCE_API_KEY");
console.log("-----------------------------------");

if (uitslag.uitgegevenOp) console.log(`Uitgegeven op : ${nl(uitslag.uitgegevenOp)}`);

if (!uitslag.verlooptOp) {
  console.log(`Vervaldatum   : onbekend`);
  console.log(`\n${uitslag.opmerking ?? ""}`);
  process.exit(0);
}

const dagen = dagenTot(uitslag.verlooptOp) ?? 0;

console.log(`Vervaldatum   : ${nl(uitslag.verlooptOp)}`);
console.log(
  dagen < 0
    ? `Status        : VERLOPEN, ${Math.abs(dagen)} dagen geleden. Alle Météo-France-routes geven nu 401.`
    : `Status        : nog ${dagen} dagen geldig.`
);
