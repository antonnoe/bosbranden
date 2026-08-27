// Koppelen van een persbericht aan een gemeten hittebron — de regels, los van
// het ophalen. Zie lib/mediatreffers.ts voor de feeds en de geocoder.
//
// WAAROM DIT BESTAAT. Een satellietmeting zegt "hier is warmte". Een krant zegt
// "hier brandt het bos". Dat tweede is onafhankelijke, door mensen vastgestelde
// informatie en daarmee categorisch meer waard dan nóg een herberekening van
// dezelfde pixels. Vandaar de koppeling.
//
// TWEE DINGEN DIE DEZE KOPPELING NADRUKKELIJK NIET DOET.
//
// 1. Ze werkt maar één kant op. Een treffer waardeert een melding op; het
//    ontbreken van een treffer zegt NIETS. De tool leest zes regionale feeds
//    (Nouvelle-Aquitaine, Occitanie, Île-de-France, PACA). Corsica, Centre,
//    Bourgogne, Grand Est, Bretagne en Auvergne hebben geen enkele bron. Bovendien
//    is de satelliet meestal eerder dan de pers, en haalt een brand van vijf
//    hectare de krant vaak nooit. "Geen nieuws" betekent hier dus overwegend
//    "wij lezen daar geen krant" — dat mag nooit als geruststelling verschijnen.
//
// 2. Ze koppelt liever niets dan iets verkeerds. "De pers meldt hier een brand"
//    bij het verkeerde dorp is een echte fout, en tien gemiste koppelingen zijn
//    goedkoper dan één verkeerde. Alle drempels hieronder staan daarom streng.
//
// Bewust vrij van imports en van het "@/"-alias, zodat de zelftest dit buiten
// Next kan laden (zie scripts/test-mediakoppeling.ts).

// ---- Drempels -------------------------------------------------------------

// Een gemeente is een vlak, geen punt: de geocoder geeft het middelpunt terug,
// terwijl de brand ergens in die gemeente ligt. Franse gemeenten zijn gemiddeld
// klein, maar in het zuidwesten en de Alpen flink groter. 20 km vangt die
// speling en sluit een brand honderd kilometer verderop nog steeds uit.
export const MAX_AFSTAND_KM = 20;

// De satelliet is meestal eerder dan de pers, maar niet altijd: een brand die
// gisteravond begon staat vanochtend in de krant en wordt vandaag pas weer
// gemeten. Vandaar een venster aan beide kanten van de laatste meting.
export const MAX_TIJDSVERSCHIL_UREN = 24;

// Ondergrens voor de score van de geocoder (BAN geeft 0–1). Onder deze waarde
// heeft hij de naam niet echt herkend maar iets in de buurt gevonden.
export const MIN_GEOCODER_SCORE = 0.6;

// Hoeveel de beste kandidaat op de tweede vóór moet liggen. Frankrijk telt
// tientallen gemeenten die met "Saint-" beginnen; zonder dit verschil zou de
// koppeling er willekeurig één kiezen.
export const MIN_SCOREVERSCHIL = 0.1;

// ---- Plaatsnaam uit een kop halen -----------------------------------------

// Voorzetsels waarna in een Franse kop een plaatsnaam volgt. Bewust kort
// gehouden: hoe meer patronen, hoe meer kans op een toevallige treffer.
const VOORZETSELS = [
  "près de",
  "pres de",
  "près d'",
  "pres d'",
  "aux",
  "au",
  "à",
  "a",
];

// Kleine woorden die BINNEN een Franse gemeentenaam mogen staan zonder
// hoofdletter: Saint-Médard-en-Jalles, Villeneuve-lès-Avignon, L'Isle-Jourdain.
const TUSSENWOORDEN = new Set([
  "de", "du", "des", "d", "la", "le", "les", "l",
  "sur", "sous", "en", "lès", "les-", "et", "aux", "au",
]);

const HOOFDLETTER = /^[A-ZÀ-ÖØ-Þ]/;

// Haalt kandidaat-plaatsnamen uit een kop. Levert er hooguit een paar op; welke
// ervan een echte gemeente is, beslist de geocoder.
//
// Alleen namen ná een voorzetsel. Een kop begint vaak met een departement
// ("Haute-Garonne : incendie à Boulogne") en dat is geen gemeente; door het
// voorzetsel te eisen slaan we die over in plaats van hem te verwarren met een
// plaats.
export function haalPlaatsnamenUitKop(kop: string): string[] {
  const gevonden: string[] = [];
  const woorden = kop.split(/\s+/);

  for (let i = 0; i < woorden.length; i += 1) {
    // Voorzetsel herkennen, ook het tweewoordige "près de".
    let lengte = 0;
    for (const vz of VOORZETSELS) {
      const delen = vz.split(" ");
      const kandidaat = woorden
        .slice(i, i + delen.length)
        .join(" ")
        .toLowerCase()
        .replace(/[,:.]$/, "");
      if (kandidaat === vz) {
        lengte = delen.length;
        break;
      }
    }
    if (lengte === 0) continue;

    // Vanaf hier woorden verzamelen zolang ze bij een gemeentenaam kunnen horen.
    const naam: string[] = [];
    for (let j = i + lengte; j < woorden.length; j += 1) {
      const ruw = woorden[j].replace(/^[«"(]+/, "").replace(/[»",:;.!?)]+$/, "");
      if (!ruw) break;
      const isHoofdletter = HOOFDLETTER.test(ruw);
      const isTussenwoord = TUSSENWOORDEN.has(ruw.toLowerCase().replace(/'$/, ""));
      // Het eerste woord MOET een hoofdletter hebben; daarna mogen tussenwoorden.
      if (naam.length === 0 && !isHoofdletter) break;
      if (!isHoofdletter && !isTussenwoord) break;
      naam.push(ruw);
      // Een gemeentenaam van meer dan vier woorden bestaat nauwelijks; verder
      // lezen levert alleen maar de rest van de zin op.
      if (naam.length >= 4) break;
    }

    if (naam.length > 0) {
      // Een afsluitend tussenwoord hoort niet bij de naam ("à Foix et ...").
      while (
        naam.length > 1 &&
        TUSSENWOORDEN.has(naam[naam.length - 1].toLowerCase().replace(/'$/, ""))
      ) {
        naam.pop();
      }
      const samen = naam.join(" ");
      if (samen.length >= 3 && !gevonden.includes(samen)) gevonden.push(samen);
    }
  }

  return gevonden;
}

// ---- Beoordelen van een geocoder-uitslag ----------------------------------

export interface GeocodeKandidaat {
  score: number;
  citycode: string; // INSEE-code van de gemeente
  city: string; // gemeentenaam zoals de geocoder hem kent
  latitude: number;
  longitude: number;
}

// Departementscode uit een INSEE-gemeentecode. Métropole: de eerste twee tekens.
// Corsica heeft "2A"/"2B", en die staan al zo in de code — hetzelfde formaat als
// lib/departements.ts gebruikt.
export function departementUitCitycode(citycode: string): string | null {
  if (!/^(2[AB]|[0-9]{2})[0-9A-Z]{3}$/i.test(citycode)) return null;
  return citycode.slice(0, 2).toUpperCase();
}

// Is de uitslag van de geocoder ondubbelzinnig genoeg om op te bouwen?
// De tweede kandidaat mag niet te dicht bij de eerste zitten, anders koos de
// geocoder feitelijk willekeurig tussen twee gelijknamige gemeenten.
export function kiesOndubbelzinnig(
  kandidaten: GeocodeKandidaat[]
): GeocodeKandidaat | null {
  if (kandidaten.length === 0) return null;
  const gesorteerd = [...kandidaten].sort((a, b) => b.score - a.score);
  const beste = gesorteerd[0];
  if (beste.score < MIN_GEOCODER_SCORE) return null;
  const tweede = gesorteerd[1];
  if (tweede && beste.score - tweede.score < MIN_SCOREVERSCHIL) return null;
  return beste;
}

// ---- De koppeling zelf ----------------------------------------------------

export interface Brandhaard {
  lat: number;
  lon: number;
  departementCode: string | null;
  laatsteDetectie: string; // ISO
}

export interface Kandidaatbericht {
  titel: string;
  url: string;
  bron: string;
  gepubliceerdOp: string; // ISO
  plaats: GeocodeKandidaat;
}

export interface MediaTreffer {
  titel: string;
  url: string;
  bron: string;
  plaats: string;
  gepubliceerdOp: string;
}

export function afstandKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Past dit bericht bij deze brandhaard? Drie eisen, alle drie hard:
//   1. hetzelfde departement — dit sluit gelijknamige gemeenten elders uit;
//   2. hooguit MAX_AFSTAND_KM tussen gemeente en gemeten haard;
//   3. hooguit MAX_TIJDSVERSCHIL_UREN tussen publicatie en laatste meting.
export function berichtPastBijHaard(
  bericht: Kandidaatbericht,
  haard: Brandhaard
): boolean {
  const dep = departementUitCitycode(bericht.plaats.citycode);
  if (!dep || !haard.departementCode || dep !== haard.departementCode) return false;

  const km = afstandKm(haard.lat, haard.lon, bericht.plaats.latitude, bericht.plaats.longitude);
  if (!Number.isFinite(km) || km > MAX_AFSTAND_KM) return false;

  const tGepubliceerd = Date.parse(bericht.gepubliceerdOp);
  const tGemeten = Date.parse(haard.laatsteDetectie);
  if (!Number.isFinite(tGepubliceerd) || !Number.isFinite(tGemeten)) return false;
  const uren = Math.abs(tGepubliceerd - tGemeten) / 3_600_000;
  return uren <= MAX_TIJDSVERSCHIL_UREN;
}

// De beste treffer voor één haard: van de passende berichten het dichtstbijzijnde,
// bij gelijke afstand het nieuwste. Eén treffer per haard — een opsomming van
// drie artikelen over dezelfde brand voegt niets toe.
export function besteTrefferVoorHaard(
  berichten: Kandidaatbericht[],
  haard: Brandhaard
): MediaTreffer | null {
  const passend = berichten.filter((b) => berichtPastBijHaard(b, haard));
  if (passend.length === 0) return null;

  passend.sort((a, b) => {
    const dA = afstandKm(haard.lat, haard.lon, a.plaats.latitude, a.plaats.longitude);
    const dB = afstandKm(haard.lat, haard.lon, b.plaats.latitude, b.plaats.longitude);
    return dA - dB || Date.parse(b.gepubliceerdOp) - Date.parse(a.gepubliceerdOp);
  });

  const beste = passend[0];
  return {
    titel: beste.titel,
    url: beste.url,
    bron: beste.bron,
    plaats: beste.plaats.city,
    gepubliceerdOp: beste.gepubliceerdOp,
  };
}
