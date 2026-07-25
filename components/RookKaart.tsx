"use client";

import { useMemo, useState } from "react";
import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import styles from "@/components/RookKaart.module.css";

const TIJDEN = [0, 6, 12, 24] as const;
type Tijdstap = (typeof TIJDEN)[number];

export default function RookKaart() {
  const [tijdstap, setTijdstap] = useState<Tijdstap>(0);
  const [dekking, setDekking] = useState(62);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(false);
  const afbeeldingUrl = useMemo(() => `/api/rook?uur=${tijdstap}`, [tijdstap]);

  function kiesTijd(volgende: Tijdstap) {
    setTijdstap(volgende);
    setLaden(true);
    setFout(false);
  }

  return (
    <div className={`omhulsel ${styles.rookOmhulsel}`}>
      <section className={`sectie ${styles.rookSectie}`} aria-labelledby="rook-titel">
        <div className={styles.kop}>
          <div>
            <h2 id="rook-titel">Verwachte rookverspreiding</h2>
            <p>
              Modelverwachting van fijnstof uit natuurbranden op leefniveau. Kies een tijdstip om te
              zien waar de rook zich volgens CAMS waarschijnlijk naartoe verplaatst.
            </p>
          </div>
          <span className={styles.modelBadge}>modelverwachting</span>
        </div>

        <div className={styles.bediening}>
          <div className={styles.tijdKnoppen} role="group" aria-label="Kies de verwachtingstijd">
            {TIJDEN.map((uren) => (
              <button
                key={uren}
                type="button"
                aria-pressed={tijdstap === uren}
                onClick={() => kiesTijd(uren)}
              >
                {uren === 0 ? "Nu" : `+${uren} uur`}
              </button>
            ))}
          </div>

          <label className={styles.transparantie}>
            <span>Rooklaag {dekking}%</span>
            <input
              type="range"
              min="25"
              max="90"
              step="5"
              value={dekking}
              onChange={(event) => setDekking(Number(event.target.value))}
              aria-label="Doorzichtigheid van de rooklaag"
            />
          </label>
        </div>

        <div className={styles.kaartKader}>
          <svg
            className={styles.kaart}
            viewBox={KAART_VIEWBOX}
            role="img"
            aria-label={`CAMS-verwachting van rook uit natuurbranden voor ${
              tijdstap === 0 ? "nu" : `over ${tijdstap} uur`
            }`}
          >
            <image
              key={afbeeldingUrl}
              className={styles.rookBeeld}
              href={afbeeldingUrl}
              x="0"
              y="0"
              width="1000"
              height="959"
              preserveAspectRatio="none"
              opacity={dekking / 100}
              onLoad={() => {
                setLaden(false);
                setFout(false);
              }}
              onError={() => {
                setLaden(false);
                setFout(true);
              }}
            />

            {KAART_PADEN.map((pad) => (
              <path key={pad.code} className={styles.departement} d={pad.d}>
                <title>{pad.naam}</title>
              </path>
            ))}
          </svg>

          {laden && !fout && <p className={styles.laden}>CAMS-rookverwachting laden…</p>}
          {fout && (
            <p className={styles.fout} role="alert">
              De CAMS-rooklaag is tijdelijk niet beschikbaar. Probeer een ander tijdstip of later
              opnieuw.
            </p>
          )}
        </div>

        <div className={styles.onderKaart}>
          <p className={styles.uitleg}>
            Donkerdere zones betekenen een hogere verwachte concentratie PM10 die door CAMS aan
            natuurbranden wordt toegeschreven. Dit is geen satellietfoto en geen garantie dat rook
            op straatniveau zichtbaar of ruikbaar is. Wind, neerslag, brandintensiteit en de hoogte
            van de rookpluim kunnen de werkelijke situatie veranderen.
          </p>
          <img
            className={styles.legenda}
            src="/api/rook?legenda=1"
            alt="Legenda CAMS-concentratie natuurbrandrook in microgram per kubieke meter"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </div>

        <p className={styles.bron}>
          Bron: CAMS European air quality forecast, ECMWF/Copernicus. PM10 uit natuurbranden is een
          experimenteel modelproduct en wordt met voorzichtigheid geïnterpreteerd. Gegenereerd met
          Copernicus Atmosphere Monitoring Service-informatie {new Date().getFullYear()}.
        </p>
      </section>
    </div>
  );
}
