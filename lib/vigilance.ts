// Server-side koppeling met de Vigilance-API van Météo-France.
//
// WAAROM DEZE MODULE BESTAAT. De Météo des forêts wordt alleen tijdens het
// brandseizoen (juni t/m september) gepubliceerd; zeven maanden per jaar staat
// die kaart leeg. Vigilance draait het hele jaar en dekt negen gevaren, van
// storm en overstroming tot hitte, vorst en lawines. Brandrisico wordt daarmee
// één laag naast andere, in plaats van de enige reden om de tool te openen.
//
// Portaal-administratie (afgelezen van het ingelogde API-portaal op
// 03-09-2026, zie README). De API heet in de catalogus "Vigilance Bulletin"
// en hangt al onder DefaultApplication, dezelfde applicatie als Forest weather.
// Er is dus GEEN tweede env var: dezelfde METEOFRANCE_API_KEY werkt.
// Limiet 60 requests/minuut, abonnement loopt tot 10-07-2028.
//
// De key staat uitsluitend in de Vercel env var METEOFRANCE_API_KEY en wordt
// nooit aan de client doorgegeven.

// Het basepath is niet publiek gedocumenteerd. De catalogus toont
// "DonneesPubliquesVigilance" in de URL, terwijl de runtime-host bij de
// zusterapi "DPMeteoForets" gebruikt (niet "DonneesPubliquesMeteoForets").
// We proberen daarom beide vormen en rapporteren welke werkte, in plaats van
// één te gokken en bij een 404 te blijven staan.
export const VIGILANCE_BASISPADEN = [
  "https://public-api.meteofrance.fr/public/DPVigilance/v1",
  "https://public-api.meteofrance.fr/public/DonneesPubliquesVigilance/v1",
] as const;

export const VIGILANCE_PAD = "/cartevigilance/encours";

// Vigilance wordt twee keer per dag vastgesteld (rond 06:00 en 16:00) maar kan
// bij een opkomende situatie tussentijds worden bijgewerkt. Zes uur cache zoals
// bij de Météo des forêts is hier dus te grof: dan mist de kaart een opschaling
// naar oranje. Een kwartier is vers genoeg en kost 4 requests per uur, ruim
// binnen de 60 per minuut die het abonnement toestaat.
export const VIGILANCE_CACHE_SECONDEN = 15 * 60;

export async function haalRuweVigilanceOp(): Promise<{
  status: number;
  body: string;
  basispad: string;
}> {
  const key = process.env.METEOFRANCE_API_KEY;
  if (!key) {
    throw new Error("METEOFRANCE_API_KEY ontbreekt (Vercel env var).");
  }

  let laatste: { status: number; body: string; basispad: string } | null = null;

  for (const basis of VIGILANCE_BASISPADEN) {
    const res = await fetch(`${basis}${VIGILANCE_PAD}`, {
      headers: { apikey: key, accept: "*/*" },
      next: { revalidate: VIGILANCE_CACHE_SECONDEN },
    });
    const body = await res.text();
    const poging = { status: res.status, body, basispad: basis };
    if (res.status === 200) return poging;
    // Een 404 betekent "verkeerd basepath, probeer de andere". Een 401 of 403
    // betekent een sleutelprobleem en geldt voor beide paden gelijk: dan heeft
    // doorproberen geen zin en verdwijnt de echte oorzaak uit beeld.
    if (res.status === 401 || res.status === 403) return poging;
    laatste = poging;
  }

  return laatste!;
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
} from "./vigilance-normalisatie.ts";
export type {
  Termijn,
  VigilanceData,
  VigilanceDepartement,
} from "./vigilance-normalisatie.ts";
