// Eén bron van waarheid voor de versheid van het nieuws in de zijlade.
// ---------------------------------------------------------------------------
// AANLEIDING. Op 26-08-2026 toonde de lade bij de eerste opening items van
// 1 augustus en pas bij de tweede opening de verse lichting. Oorzaak was niet
// een stilstaande vernieuwing maar een cache: de route stond op
// `export const revalidate = 900`, waarmee Next er een ISR-route van maakt.
// ISR ververst NIET uit zichzelf elke 15 minuten — het venster zegt alleen dat
// een bezoeker ná 15 minuten de OUDE versie krijgt en daarmee een
// achtergrondvernieuwing aftrapt. Op een tool met weinig verkeer kan zo'n
// bewaarde versie dus weken blijven staan tot iemand hem aanraakt.
//
// De vier grenzen hieronder maken samen hard dat een bezoeker nooit iets ouder
// dan een uur ziet:
//
//   feedgegevens        ten hoogste FEED_REVALIDATE_S oud   (15 min)
//   + CDN-venster       ten hoogste MAXAGE + SWR            (5 + 5 = 10 min)
//   ------------------------------------------------------------------
//   = wat een bezoeker in het normale geval ziet             ~25 min
//
//   MAX_LEEFTIJD_MS is de harde bovengrens die de zijlade zelf bewaakt: is het
//   antwoord tóch ouder (CDN-eigenaardigheid, bevroren tussenliggende cache,
//   een client die uren open staat), dan toont de lade het niet meer als
//   actueel maar haalt het opnieuw op langs de cache heen, en meldt het als het
//   dan nog steeds te oud is.

// Hoe lang een opgehaalde feed in de Next Data Cache mag blijven staan.
export const FEED_REVALIDATE_S = 900; // 15 minuten

// CDN-venster op de route-respons. Bewust klein: de route zelf is goedkoop,
// want de dure delen (feeds, samenvattingen) hebben hun eigen cache.
export const NIEUWS_CDN_MAXAGE_S = 300; // 5 minuten vers
export const NIEUWS_CDN_SWR_S = 300; // daarna hooguit 5 minuten stale

// Harde bovengrens die de client bewaakt. Boven deze leeftijd geldt een
// antwoord niet meer als actueel, ook niet als het de laatst geslaagde ronde is.
export const MAX_LEEFTIJD_MS = 60 * 60 * 1000; // 1 uur

// Hoe vaak de zijlade zelf opnieuw ophaalt zolang de pagina open staat.
export const CLIENT_VERVERS_MS = 15 * 60 * 1000; // 15 minuten

// Leeftijd van een ISO-tijdstip in milliseconden; null als het onbruikbaar is.
export function leeftijdMs(iso: string | null | undefined, nu: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return nu - t;
}

// Is dit antwoord te oud om nog als actueel te tonen?
// Een onbruikbaar of ontbrekend tijdstip telt als te oud: liever een eerlijke
// melding dan een stand waarvan we de ouderdom niet kennen.
export function teOud(iso: string | null | undefined, nu: number): boolean {
  const leeftijd = leeftijdMs(iso, nu);
  if (leeftijd === null) return true;
  return leeftijd > MAX_LEEFTIJD_MS;
}
