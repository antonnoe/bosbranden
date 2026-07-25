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
  opmerking?: string;
}
