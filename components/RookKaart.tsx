"use client";

import { useEffect, useMemo, useState } from "react";
import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import styles from "@/components/RookKaart.module.css";

const TIJDEN = [0, 6, 12, 24] as const;
type Tijdstap = (typeof TIJDEN)[number];

interface RookMetadata {
  beschikbaar: boolean;
  verouderd: boolean;
  gevraagdUur: number;
  geldigVoor: string | null;
  eersteBeschikbaar: string | null;
  laatsteBeschikbaar: string | null;
  afwijkingUren: number | null;
  laag: string;
  eenheid: string;
  laagsteKlasse: string;
  toelichting: string;
}

export default function RookKaart() {
  const [tijdstap, setTijdstap] = useState<Tijdstap>(0);
  const [dekking, setDekking] = useState(62);
  const [metadata, setMetadata] = useState<RookMetadata | null>(null);
  const [metadataLaden, setMetadataLaden] = useState(true);
  const [beeldLaden, setBeeldLaden] = useState(false);
  const [beeldGeladen, setBeeldGeladen] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let actief = true;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    setMetadata(null);
    setMetadataLaden(true);
    setBeeldLaden(false);
    setBeeldGeladen(false);
    setFout(null);

    (async () => {
      try {
        const res = await fetch(`/api/rook?meta=1&uur=${tijdstap}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json()) as RookMetadata;
        if (!actief) return;

        setMetadata(json);
        if (!res.ok || !json.beschikbaar || !json.geldigVoor) {
          setFout(json.toelichting || "Actuele CAMS-rookgegevens zijn tijdelijk niet beschikbaar.");
          return;
        }

        setBeeldLaden(true);
      } catch (error) {
        if (!actief) return;
        setFout(
          error instanceof DOMException && error.name === "AbortError"
            ? "CAMS reageerde niet binnen 15 seconden. De rooklaag wordt daarom niet als geladen weergegeven."
            : "De actuele CAMS-modeltijd kon niet worden opgehaald."
        );
      } finally {
        window.clearTimeout(timeout);
        if (actief) setMetadataLaden(false);
      }
    })();

    return () => {
      actief = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [tijdstap]);

  const afbeeldingUrl = useMemo(() => {
    if (!metadata?.beschikbaar || !metadata.geldigVoor) return null;
    return `/api/rook?uur=${tijdstap}&modeltijd=${encodeURIComponent(metadata.geldigVoor)}`;
  }, [metadata, tijdstap]);

  useEffect(() => {
    if (!afbeeldingUrl || !beeldLaden) return;

    const timeout = window.setTimeout(() => {
      setBeeldLaden(false);
      setBeeldGeladen(false);
      setFout("De CAMS-kaartafbeelding reageerde niet binnen 20 seconden.");
    }, 20_000);

    return () => window.clearTimeout(timeout);
  }, [afbeeldingUrl, beeldLaden]);

  const kaartLabel = `CAMS-verwachting van rook uit natuurbranden voor ${
    tijdstap === 0 ? "nu" : `over ${tijdstap} uur`
  }`;

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
                onClick={() => setTijdstap(uren)}
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

        {metadataLaden && (
          <p className={styles.geladenStatus} aria-live="polite">
            Actuele CAMS-modeltijd controleren…
          </p>
        )}

        {!metadataLaden && fout && (
          <p className={`${styles.geladenStatus} ${styles.statusFout}`} role="alert">
            <strong>Geen actuele rookkaart.</strong> {fout}
            {metadata?.laatsteBeschikbaar ? (
              <> Laatste aangetroffen modeltijd: {formatteerModeltijd(metadata.laatsteBeschikbaar)}.</>
            ) : null}
          </p>
        )}

        {!metadataLaden && !fout && beeldLaden && metadata?.geldigVoor && (
          <p className={styles.geladenStatus} aria-live="polite">
            CAMS-rookkaart voor {formatteerModeltijd(metadata.geldigVoor)} laden…
          </p>
        )}

        {!metadataLaden && !fout && beeldGeladen && metadata?.geldigVoor && (
          <p className={styles.geladenStatus} aria-live="polite">
            <strong>Actuele CAMS-laag geladen.</strong> Modeltijd: {formatteerModeltijd(metadata.geldigVoor)}.
            Lichtblauw is de laagste klasse ({metadata.laagsteKlasse}). Een vrijwel volledig lichtblauwe
            kaart betekent geen of zeer weinig voorspelde natuurbrandrook op leefniveau.
          </p>
        )}

        <div className={styles.kaartKader} role="img" aria-label={kaartLabel}>
          {afbeeldingUrl && !fout && (
            <img
              key={afbeeldingUrl}
              className={styles.rookBeeld}
              src={afbeeldingUrl}
              alt=""
              aria-hidden="true"
              style={{ opacity: dekking / 100 }}
              onLoad={() => {
                setBeeldLaden(false);
                setBeeldGeladen(true);
                setFout(null);
              }}
              onError={() => {
                setBeeldLaden(false);
                setBeeldGeladen(false);
                setFout("De CAMS-kaartafbeelding kon niet worden geladen.");
              }}
            />
          )}

          <svg className={styles.grenzen} viewBox={KAART_VIEWBOX} aria-hidden="true">
            {KAART_PADEN.map((pad) => (
              <path key={pad.code} className={styles.departement} d={pad.d}>
                <title>{pad.naam}</title>
              </path>
            ))}
          </svg>

          {(metadataLaden || beeldLaden) && !fout && (
            <p className={styles.laden}>CAMS-gegevens laden…</p>
          )}
          {!metadataLaden && fout && (
            <p className={styles.fout}>Geen actuele CAMS-rasterlaag getoond.</p>
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

function formatteerModeltijd(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(datum);
}
