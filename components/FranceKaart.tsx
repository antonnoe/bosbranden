"use client";

// Klikbare SVG-kaart van Frankrijk (métropole incl. Corsica), met optionele
// rustige pinlaag voor recente NASA FIRMS-satellietwaarnemingen.

import { DEP_BY_CODE } from "@/lib/departements";
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
  const [, , kaartBreedte, kaartHoogte] = KAART_VIEWBOX.split(" ").map(Number);
  const gekozenPunt =
    toonWaarnemingen && gekozenWaarneming
      ? waarnemingen.find((waarneming) => waarneming.id === gekozenWaarneming) ?? null
      : null;
  const popupCoordinaat = gekozenPunt
    ? projecteerCoordinaat(gekozenPunt.longitude, gekozenPunt.latitude)
    : null;

  let popupPositieKlasse = styles.popupRechtsOnder;
  if (popupCoordinaat) {
    const linksVanPin = popupCoordinaat.x > kaartBreedte * 0.62;
    const bovenPin = popupCoordinaat.y > kaartHoogte * 0.62;

    if (linksVanPin && bovenPin) popupPositieKlasse = styles.popupLinksBoven;
    else if (linksVanPin) popupPositieKlasse = styles.popupLinksOnder;
    else if (bovenPin) popupPositieKlasse = styles.popupRechtsBoven;
  }

  return (
    <div className={styles.kaartContainer}>
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
                <path d="M0-15.5C-8.3-15.5-13.8-9.8-13.8-1.9C-13.8 7.8 0 19.2 0 19.2S13.8 7.8 13.8-1.9C13.8-9.8 8.3-15.5 0-15.5Z" />
                <circle cy="-1.9" r="4.1" />
              </g>
            );
          })}
      </svg>

      {gekozenPunt && popupCoordinaat && (
        <div
          className={`${styles.pinPopup} ${popupPositieKlasse}`}
          style={{
            left: `${(popupCoordinaat.x / kaartBreedte) * 100}%`,
            top: `${(popupCoordinaat.y / kaartHoogte) * 100}%`,
          }}
          role="dialog"
          aria-modal="false"
          aria-labelledby="satelliet-popup-titel"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.popupSluit}
            aria-label="Kaartje sluiten"
            onClick={() => onKiesWaarneming(gekozenPunt.id)}
          >
            ×
          </button>

          <h3 id="satelliet-popup-titel">
            Satellietwaarneming{" "}
            <span className="dep-code">{gekozenPunt.departementCode}</span>
          </h3>

          <div className={styles.detailGrid}>
            <span className={styles.detailLabel}>Locatie</span>
            <span>
              {DEP_BY_CODE[gekozenPunt.departementCode]?.naam ??
                `departement ${gekozenPunt.departementCode}`}
              <br />
              {gekozenPunt.latitude.toFixed(4)}, {gekozenPunt.longitude.toFixed(4)}
            </span>

            <span className={styles.detailLabel}>Waargenomen</span>
            <span>{formatteerDatum(gekozenPunt.waargenomenOp)}</span>

            <span className={styles.detailLabel}>Sensor</span>
            <span>
              {gekozenPunt.instrument} · {gekozenPunt.satelliet}
              {gekozenPunt.dagNacht ? ` · ${gekozenPunt.dagNacht}` : ""}
            </span>

            <span className={styles.detailLabel}>Betrouwbaarheid</span>
            <span>{gekozenPunt.betrouwbaarheid}</span>

            {gekozenPunt.frp !== null && (
              <>
                <span className={styles.detailLabel}>FRP</span>
                <span>{formatteerGetal(gekozenPunt.frp)} MW</span>
              </>
            )}
          </div>

          <p className={styles.popupBron}>
            Bron:{" "}
            <a
              href="https://firms.modaps.eosdis.nasa.gov/"
              target="_blank"
              rel="noopener noreferrer"
            >
              NASA FIRMS — VIIRS
            </a>
          </p>
          <p className={styles.caveat}>
            Gemeten hittebron; niet automatisch een door de Franse autoriteiten bevestigde
            natuurbrand. FRP is het geschatte uitgestraalde vermogen, niet het verbrande
            oppervlak.
          </p>
        </div>
      )}
    </div>
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

function formatteerDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

function formatteerGetal(waarde: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(waarde);
}
