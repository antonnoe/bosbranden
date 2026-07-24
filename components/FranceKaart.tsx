"use client";

// Klikbare SVG-kaart van Frankrijk (métropole incl. Corsica), met optionele
// rustige pinlaag voor recente NASA FIRMS-satellietwaarnemingen.

import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import { projecteerCoordinaat } from "@/lib/kaart-projectie";
import { niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import type { Waarneming } from "@/lib/waarnemingen";
import type { Niveaus } from "@/components/Tool";
import styles from "@/components/Waarnemingen.module.css";

export default function FranceKaart({
  niveaus,
  echeance,
  gekozen,
  onKies,
  waarnemingen,
  toonWaarnemingen,
  gekozenWaarneming,
  onKiesWaarneming,
}: {
  niveaus: Niveaus;
  echeance: "j1" | "j2";
  gekozen: string | null;
  onKies: (code: string) => void;
  waarnemingen: Waarneming[];
  toonWaarnemingen: boolean;
  gekozenWaarneming: string | null;
  onKiesWaarneming: (id: string) => void;
}) {
  return (
    <svg
      className="kaart-vlak"
      viewBox={KAART_VIEWBOX}
      role="group"
      aria-label={`Kaart van Frankrijk met bosbrandgevaar per departement (${
        echeance === "j1" ? "morgen" : "overmorgen"
      })${toonWaarnemingen ? " en satellietwaarnemingen van de afgelopen 24 uur" : ""}`}
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

      {toonWaarnemingen &&
        waarnemingen.map((waarneming) => {
          const { x, y } = projecteerCoordinaat(
            waarneming.longitude,
            waarneming.latitude
          );
          const geselecteerd = gekozenWaarneming === waarneming.id;
          const label = `Satellietwaarneming in departement ${waarneming.departementCode}, betrouwbaarheid ${
            waarneming.betrouwbaarheid
          }, ${formatteerKorteDatum(waarneming.waargenomenOp)}`;

          return (
            <g
              key={waarneming.id}
              className={`${styles.mapPin}${geselecteerd ? ` ${styles.mapPinSelected}` : ""}`}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={geselecteerd}
              onClick={(e) => {
                e.stopPropagation();
                onKiesWaarneming(waarneming.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onKiesWaarneming(waarneming.id);
                }
              }}
            >
              <title>{label}</title>
              <path d="M0-12C-6.6-12-11-7.6-11-1.5C-11 6 0 15 0 15S11 6 11-1.5C11-7.6 6.6-12 0-12Z" />
              <circle cy="-1.5" r="3.2" />
            </g>
          );
        })}
    </svg>
  );
}

function formatteerKorteDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}
