// Eén bron van waarheid voor de verversfrequenties die in de technische
// verantwoording worden getoond. De tekst leidt de frequentie hier vandaan af
// (via formatteerDuur), zodat er nergens een getal hard in de prozatekst staat
// en de tekst meebeweegt als een instelling hier wijzigt.
//
// De waarden spiegelen de cache-instellingen van de routes. `brandgevaar` wordt
// live afgeleid uit lib/meteofrance (de route importeert daar dezelfde
// constante). De overige zijn hier gecentraliseerd met de bronregel erbij;
// controleer ze tegen de genoemde route als je een cache-instelling wijzigt.

import { CACHE_SECONDEN as DANGER_SECONDEN } from "@/lib/meteofrance";
import { FIRMS_REVALIDATE_SECONDEN } from "@/lib/firms";
import { FIJNSTOF_REVALIDATE_SECONDEN } from "@/lib/rookdrift";

export const VERVERS_SECONDEN = {
  // /api/danger → lib/meteofrance CACHE_SECONDEN (live geïmporteerd)
  brandgevaar: DANGER_SECONDEN,
  // /api/waarnemingen → de FIRMS-fetch wint (lib/firms), niet de route-revalidate.
  // Live geïmporteerd, zodat de tekst nooit trager belooft dan de data ververst.
  hittebronnen: FIRMS_REVALIDATE_SECONDEN,
  // /api/rookpluimen → windveld (30 min) én CAMS-fijnstof (60 min) in lib/rookdrift.
  // We noemen de traagste component, zodat de tekst de data niet vooruitloopt.
  rook: FIJNSTOF_REVALIDATE_SECONDEN,
  // /api/fr-alert → Cache-Control s-maxage=120 (route-respons)
  waarschuwingen: 120,
  // /api/nieuws → export const revalidate = 900
  nieuws: 900,
  // /api/status → export const revalidate = 300
  status: 300,
} as const;

// Zet seconden om naar gewone taal ("6 uur", "15 minuten"). Geen getal in proza.
export function formatteerDuur(seconden: number): string {
  if (seconden % 3600 === 0) {
    const uur = seconden / 3600;
    return `${uur} ${uur === 1 ? "uur" : "uur"}`;
  }
  if (seconden % 60 === 0) {
    const minuten = seconden / 60;
    return `${minuten} ${minuten === 1 ? "minuut" : "minuten"}`;
  }
  return `${seconden} seconden`;
}
