// Gekleurd blok met het gevaarniveau voor één dag (J+1 of J+2),
// in de officiële Météo-France-kleuren.

import { niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";

export default function NiveauBlok({
  dag,
  waarde,
}: {
  dag: string;
  waarde: number | null;
}) {
  const niveau = niveauVoor(waarde);
  if (!niveau) {
    return (
      <div
        className="niveau-blok"
        style={{ background: GEEN_DATA_KLEUR, color: "#4a4a4a" }}
      >
        <div className="blok-dag">{dag}</div>
        <div className="blok-niveau">geen gegevens</div>
      </div>
    );
  }
  return (
    <div
      className="niveau-blok"
      style={{ background: niveau.kleur, color: niveau.tekstKleur }}
    >
      <div className="blok-dag">{dag}</div>
      <div className="blok-niveau">
        {niveau.nl} ({niveau.waarde}/4)
      </div>
      <div className="blok-fr">niveau {niveau.fr}</div>
    </div>
  );
}
