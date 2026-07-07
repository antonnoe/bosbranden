"use client";

// Klikbare SVG-kaart van Frankrijk (métropole incl. Corsica).
// Elk departement is een <path data-dep="..."> , ingekleurd naar niveau,
// en volledig met toetsenbord en touch te bedienen.

import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import { niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import type { Niveaus } from "@/components/Tool";

export default function FranceKaart({
  niveaus,
  echeance,
  gekozen,
  onKies,
}: {
  niveaus: Niveaus;
  echeance: "j1" | "j2";
  gekozen: string | null;
  onKies: (code: string) => void;
}) {
  return (
    <svg
      className="kaart-vlak"
      viewBox={KAART_VIEWBOX}
      role="group"
      aria-label={`Kaart van Frankrijk met bosbrandgevaar per departement (${
        echeance === "j1" ? "morgen" : "overmorgen"
      })`}
    >
      {KAART_PADEN.map((pad) => {
        const waarde = niveaus[pad.code]?.[echeance] ?? null;
        const niveau = niveauVoor(waarde);
        const label = `${pad.naam} (${pad.code}): ${
          niveau ? `niveau ${niveau.nl}` : "geen gegevens"
        }`;
        return (
          <path
            key={pad.code}
            className={`dep${gekozen === pad.code ? " gekozen" : ""}`}
            data-dep={pad.code}
            d={pad.d}
            fill={niveau ? niveau.kleur : GEEN_DATA_KLEUR}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={gekozen === pad.code}
            onClick={() => onKies(pad.code)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onKies(pad.code);
              }
            }}
          >
            <title>{label}</title>
          </path>
        );
      })}
    </svg>
  );
}
