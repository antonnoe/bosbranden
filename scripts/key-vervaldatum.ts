// Leest de vervaldatum van METEOFRANCE_API_KEY, lokaal en zonder netwerk.
// Draaien:  npm run key:vervaldatum
//
// WAAROM DIT SCRIPT BESTAAT. Het API-portaal van Météo-France kent twee
// klokken die los van elkaar lopen:
//
//   1. het abonnement per API (Vigilance Bulletin t/m 10-07-2028,
//      Forest weather t/m 07-07-2028, Climatological data t/m 10-07-2028);
//   2. de geldigheidsduur van de key zelf, ingesteld bij het genereren.
//
// De tweede staat nergens in de repo en verloopt vermoedelijk eerder dan de
// eerste. Verloopt hij, dan geven ALLE Météo-France-routes tegelijk 401 en
// staat de tool stil zonder dat er iets aan de code mankeert. De datum zit in
// de key zelf als JWT-claim `exp`, dus die is lokaal af te lezen.
//
// Dit script drukt de key nooit af, ook niet gedeeltelijk, ook niet bij een
// fout. Het toont uitsluitend de datums uit de payload.

const key = process.env.METEOFRANCE_API_KEY;

if (!key) {
  console.error(
    "METEOFRANCE_API_KEY niet gevonden.\n" +
      "Draai met de key uit Vercel in de omgeving, bijvoorbeeld:\n" +
      "  METEOFRANCE_API_KEY=… npm run key:vervaldatum"
  );
  process.exit(1);
}

const delen = key.split(".");

if (delen.length !== 3) {
  console.log(
    "Deze key is geen JWT (geen drie punt-gescheiden delen), dus er valt lokaal\n" +
      "geen vervaldatum uit af te lezen. Zoek de geldigheidsduur dan op in het\n" +
      "API-portaal, bij het token-dialoog onder 'Validity period', en zet die\n" +
      "datum handmatig in de vervaldatumlijst in de README."
  );
  process.exit(0);
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

const payload = leesPayload(delen[1]);

if (!payload) {
  console.log(
    "De middelste sectie van deze key is geen leesbare JSON. Waarschijnlijk is\n" +
      "het geen standaard-JWT. Lees de geldigheidsduur af in het API-portaal."
  );
  process.exit(0);
}

function alsDatum(waarde: unknown): Date | null {
  if (typeof waarde !== "number" || !Number.isFinite(waarde)) return null;
  // JWT-claims zijn seconden sinds epoch; sommige uitgevers gebruiken
  // milliseconden. Boven het jaar 3000 in seconden is het dus milliseconden.
  const ms = waarde > 32503680000 ? waarde : waarde * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nl(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

const uitgegeven = alsDatum(payload.iat);
const vervalt = alsDatum(payload.exp);

console.log("Vervaldatum van METEOFRANCE_API_KEY");
console.log("-----------------------------------");
if (uitgegeven) console.log(`Uitgegeven op : ${nl(uitgegeven)}`);

if (!vervalt) {
  console.log(
    "Vervaldatum   : geen 'exp'-claim in deze key.\n\n" +
      "Dat betekent niet automatisch dat de key onbeperkt geldig is; het portaal\n" +
      "kan hem ook buiten de token zelf om intrekken. Noteer in dat geval in de\n" +
      "README dat de vervaldatum onbekend is, in plaats van een datum te raden."
  );
  process.exit(0);
}

const dagen = Math.floor((vervalt.getTime() - Date.now()) / 86400000);

console.log(`Vervaldatum   : ${nl(vervalt)}`);
console.log(
  dagen < 0
    ? `Status        : VERLOPEN, ${Math.abs(dagen)} dagen geleden. Alle Météo-France-routes geven nu 401.`
    : `Status        : nog ${dagen} dagen geldig.`
);
console.log(
  "\nZet deze datum in de vervaldatumlijst in de README, naast het leaf-certificaat\n" +
    "van FR-Alert en de drie abonnementseinddata."
);
