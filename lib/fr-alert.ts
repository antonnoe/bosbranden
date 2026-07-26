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
  // wanneer de route terugvalt op de laatst bekende momentopname.
  liveBron: boolean;
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
