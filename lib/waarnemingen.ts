export type Betrouwbaarheid = "nominaal" | "hoog";

export interface Waarneming {
  id: string;
  latitude: number;
  longitude: number;
  waargenomenOp: string;
  satelliet: string;
  instrument: string;
  betrouwbaarheid: Betrouwbaarheid;
  frp: number | null;
  dagNacht: "dag" | "nacht" | null;
  departementCode: string;
}

export interface WaarnemingenAntwoord {
  beschikbaar: boolean;
  waarnemingen: Waarneming[];
  bijgewerkt: string | null;
  bron: string;
  periodeUren: number;
  fout?: string;
  opmerking?: string;
}
