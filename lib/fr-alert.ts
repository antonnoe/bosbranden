export type FrAlertZekerheid = "waargenomen" | "waarschijnlijk" | "onbekend";

export interface FrAlertMelding {
  id: string;
  titel: string;
  locatie: string;
  latitude: number;
  longitude: number;
  zekerheid: FrAlertZekerheid;
  bron: string;
  begonnenOp: string | null;
  eindigtOp: string | null;
  actief: boolean;
  url: string;
}

export interface FrAlertAntwoord {
  beschikbaar: boolean;
  meldingen: FrAlertMelding[];
  bijgewerkt: string | null;
  bron: "FR-Alert";
  // liveBron is true wanneer de meldingen zojuist live zijn uitgelezen; false
  // wanneer de route terugvalt op de laatst bekende momentopname. Bij nul
  // meldingen valt er niets terug te vallen en zegt het veld dus alleen dat de
  // bron zelf gelezen is.
  liveBron: boolean;
  // bronBereikt zegt uitsluitend of er werkelijk een FR-Alert-pagina is
  // gelezen, los van wat erin stond. Dit is het veld voor een monitor: zonder
  // dit onderscheid ziet "rustige dag, geen meldingen" er precies zo uit als
  // "de scrape vindt niets meer omdat de opmaak is veranderd", en dat is de
  // fout die de feedcontrole in augustus 2026 al een keer heeft gemaakt (zie
  // scripts/test-feedcontrole.ts: nul gelezen pagina's mag nooit tot een
  // uitspraak over de bron leiden).
  bronBereikt: boolean;
  // momentopnameVan geeft aan van wanneer die momentopname dateert (ISO), of
  // null wanneer de gegevens live zijn.
  momentopnameVan: string | null;
  opmerking?: string;
}

// Een melding telt als "nu actueel" wanneer zij actief is, of wanneer haar
// einddatum in de toekomst ligt of ontbreekt. Afgelopen meldingen vallen hier
// bewust buiten, zodat de standaardweergave geen verstreken alarmen als actueel
// toont.
export function isNuActueel(melding: FrAlertMelding): boolean {
  if (melding.actief) return true;
  if (!melding.eindigtOp) return true;
  const einde = Date.parse(melding.eindigtOp);
  return !Number.isFinite(einde) || einde > Date.now();
}
