// Server-side koppeling met de Vigilance-API van Météo-France.
//
// WAAROM DEZE MODULE BESTAAT. De Météo des forêts wordt alleen tijdens het
// brandseizoen (juni t/m september) gepubliceerd; zeven maanden per jaar staat
// die kaart leeg. Vigilance draait het hele jaar en dekt negen gevaren, van
// storm en overstroming tot hitte, vorst en lawines. Brandrisico wordt daarmee
// één laag naast andere, in plaats van de enige reden om de tool te openen.
//
// De key staat uitsluitend in de Vercel env var METEOFRANCE_API_KEY en wordt
// nooit aan de client doorgegeven.

// Vastgesteld op 03-09-2026 met een live call: status 200, JSON. Er was eerder
// een tweede kandidaat (DonneesPubliquesVigilance, de naam uit de catalogus-URL)
// omdat de zusterapi op de runtime-host DPMeteoForets gebruikt en niet zijn
// volledige catalogusnaam. Die kandidaat is vervallen.
export const VIGILANCE_BASIS = "https://public-api.meteofrance.fr/public/DPVigilance/v1";
export const VIGILANCE_PAD = "/cartevigilance/encours";

// Dit product beslaat uitsluitend het Europese deel van Frankrijk: 01 t/m 95
// plus Corsica 2A en 2B, samen 96 departementen, zoals de eerste live respons
// bevestigde. De overzeese gebieden hebben eigen endpoints en zitten hier NIET
// in. Een interface die dit "Frankrijk" noemt, belooft dus meer dan de bron
// levert; de route geeft deze dekking daarom expliciet mee in het antwoord.
export const VIGILANCE_DEKKING = "metropolitaans Frankrijk (incl. Corsica), zonder overzee";

// Vigilance wordt twee keer per dag vastgesteld (rond 06:00 en 16:00) maar kan
// bij een opkomende situatie tussentijds worden bijgewerkt. Zes uur cache zoals
// bij de Météo des forêts is hier dus te grof: dan mist de kaart een opschaling
// naar oranje. Een kwartier is vers genoeg en kost 4 requests per uur, ruim
// binnen de 60 per minuut die het abonnement toestaat.
export const VIGILANCE_CACHE_SECONDEN = 15 * 60;

export async function haalRuweVigilanceOp(): Promise<{ status: number; body: string }> {
  const key = process.env.METEOFRANCE_API_KEY;
  if (!key) {
    throw new Error("METEOFRANCE_API_KEY ontbreekt (Vercel env var).");
  }
  const res = await fetch(`${VIGILANCE_BASIS}${VIGILANCE_PAD}`, {
    headers: { apikey: key, accept: "*/*" },
    next: { revalidate: VIGILANCE_CACHE_SECONDEN },
  });
  const body = await res.text();
  return { status: res.status, body };
}

// De pure logica staat aliasvrij apart zodat ze een offline zelftest kan
// hebben; hier alleen doorgegeven zodat de rest van de app één import houdt.
export {
  FENOMENEN,
  VIGILANCE_KLEUREN,
  normaliseerVigilance,
  structuurSchets,
  telDepartementen,
  termijnVan,
  waargenomenFenomenen,
} from "./vigilance-normalisatie.ts";
export type {
  Termijn,
  VigilanceData,
  VigilanceDepartement,
} from "./vigilance-normalisatie.ts";
