"use client";

// Zijkolom van /start: het redactionele "Stand van zaken"-nieuwsblok (met per
// claim een vaste bron) en een uitklapbare technische verantwoording. Beide
// secties zijn los inklapbaar (harmonica).

import { useEffect, useState } from "react";
import { STAND_VAN_ZAKEN, type StandBron } from "@/data/nieuwsfeiten";
import { VERVERS_SECONDEN, formatteerDuur } from "@/lib/cache";
import styles from "@/components/Zijkolom.module.css";

interface Verantwoording {
  id: string;
  titel: string;
  bronNaam: string;
  bronUrl: string;
  ververs: number; // seconden
  grenzen: string[];
}

const VERANTWOORDING: Verantwoording[] = [
  {
    id: "brandgevaar",
    titel: "Brandgevaar",
    bronNaam: "Météo-France — Météo des forêts",
    bronUrl: "https://meteofrance.com/meteo-des-forets",
    ververs: VERVERS_SECONDEN.brandgevaar,
    grenzen: [
      "De brandrisicokaart voorspelt het risico op nieuwe branden en toont niet waar het nu brandt.",
    ],
  },
  {
    id: "hittebronnen",
    titel: "Hittebronnen",
    bronNaam: "NASA FIRMS (VIIRS)",
    bronUrl: "https://firms.modaps.eosdis.nasa.gov/",
    ververs: VERVERS_SECONDEN.hittebronnen,
    grenzen: [
      "Een satellietdetectie is een gemeten warmte-afwijking, geen door de autoriteiten bevestigde brand.",
      "Geen detectie betekent niet dat een brand uit is: de satellieten komen maar een paar keer per etmaal over.",
    ],
  },
  {
    id: "rook",
    titel: "Rookverplaatsing",
    bronNaam: "Open-Meteo (windveld) en NASA FIRMS (hittebronnen)",
    bronUrl: "https://open-meteo.com/",
    ververs: VERVERS_SECONDEN.rook,
    grenzen: [
      "De rookberekening is een windbaan vanaf gedetecteerde hittebronnen, geen rookmodel.",
    ],
  },
  {
    id: "geostationair",
    titel: "Geostationair satellietbeeld",
    bronNaam: "EUMETSAT (MTG) en NASA GIBS",
    bronUrl: "https://view.eumetsat.int/",
    ververs: 600, // tien minuten
    grenzen: [
      "Onze hittebronnenlaag komt van poolsatellieten die maar een paar keer per etmaal overkomen; een brand die 's nachts begint en 's ochtends geblust is, kan daar volledig tussenvallen.",
      "Het geostationaire beeld kijkt continu (elke tien minuten) en dicht dat gat, maar toont waarneming — geen door de autoriteiten bevestigde brand.",
    ],
  },
  {
    id: "waarschuwingen",
    titel: "Officiële meldingen",
    bronNaam: "FR-Alert — Franse autoriteiten",
    bronUrl: "https://fr-alert.gouv.fr/",
    ververs: VERVERS_SECONDEN.waarschuwingen,
    grenzen: [
      "FR-Alert publiceert met vertraging en is geen actuele brandenlijst.",
    ],
  },
];

// sessionStorage-sleutels per sectie (geen cookies). De lade zelf gebruikt
// "bosbranden-zijkolom"; deze twee staan daar los van.
const SLEUTEL_NIEUWS = "bosbranden-zijkolom-nieuws";
const SLEUTEL_VERANTWOORDING = "bosbranden-zijkolom-verantwoording";

// Aantal afzonderlijk gebronde uitspraken in het nieuwsblok, voor de teller op
// de handgreep ("Nieuws (8)").
const NIEUWS_AANTAL = STAND_VAN_ZAKEN
  ? 1 +
    STAND_VAN_ZAKEN.blokken.reduce(
      (n, blok) => n + (blok.paragraaf ? 1 : 0) + (blok.punten?.length ?? 0),
      0
    )
  : 0;

// Bronlink: zelfde opmaak als de overige bronlinks in de zijkolom.
function BronLink({ bron }: { bron: StandBron }) {
  return (
    <a
      className={styles.standBron}
      href={bron.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {bron.label}
    </a>
  );
}

export default function Zijkolom({
  embed,
  onAantal,
}: {
  embed: boolean;
  onAantal?: (aantal: number) => void;
}) {
  const [laatsteMelding, setLaatsteMelding] = useState<string | null>(null);
  // Nieuws standaard OPEN, verantwoording standaard DICHT. Beide mogen tegelijk
  // open staan — het is geen accordeon.
  const [nieuwsOpen, setNieuwsOpen] = useState(true);
  const [verantwoordingOpen, setVerantwoordingOpen] = useState(false);

  // Bewaarde open/dicht-stand per sectie teruglezen (sessionStorage).
  useEffect(() => {
    try {
      const n = sessionStorage.getItem(SLEUTEL_NIEUWS);
      const v = sessionStorage.getItem(SLEUTEL_VERANTWOORDING);
      if (n !== null) setNieuwsOpen(n === "open");
      if (v !== null) setVerantwoordingOpen(v === "open");
    } catch {
      /* sessionStorage kan geblokkeerd zijn; dan blijven de standaardwaarden */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SLEUTEL_NIEUWS, nieuwsOpen ? "open" : "dicht");
    } catch {
      /* stil */
    }
  }, [nieuwsOpen]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SLEUTEL_VERANTWOORDING, verantwoordingOpen ? "open" : "dicht");
    } catch {
      /* stil */
    }
  }, [verantwoordingOpen]);

  // Alleen het tijdstip van de laatste officiële melding (voor de verantwoording).
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/fr-alert");
        const json: { meldingen?: Array<{ begonnenOp: string | null }> } = await res.json();
        const nieuwste = json.meldingen?.[0]?.begonnenOp ?? null;
        if (actief) setLaatsteMelding(nieuwste);
      } catch {
        /* stil: dan tonen we het tijdstip gewoon niet */
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const toonNieuws = STAND_VAN_ZAKEN !== null;

  // Meld het aantal gebronde nieuwsuitspraken terug aan de ouder, zodat de
  // handgreep van de uitschuifbare zijkolom een teller kan tonen ("Nieuws (8)").
  useEffect(() => {
    onAantal?.(NIEUWS_AANTAL);
  }, [onAantal]);

  return (
    <div className={styles.zijkolom}>
      {toonNieuws && STAND_VAN_ZAKEN && (
        <section className={styles.sectie}>
          <button
            type="button"
            className={styles.kop}
            aria-expanded={nieuwsOpen}
            aria-controls="zijkolom-nieuws"
            onClick={() => setNieuwsOpen((v) => !v)}
          >
            <span className={styles.kopTitel}>Nieuws ({NIEUWS_AANTAL})</span>
            <span className={styles.chevron} aria-hidden="true">
              {nieuwsOpen ? "−" : "+"}
            </span>
          </button>
          <div className={`${styles.wikkel} ${nieuwsOpen ? styles.open : ""}`}>
            <div id="zijkolom-nieuws" role="region" aria-label="Nieuws" className={styles.inhoud}>
              <div className={styles.stand}>
                <p className={styles.standDatum}>{STAND_VAN_ZAKEN.titel}</p>
                <p className={styles.standInleiding}>
                  {STAND_VAN_ZAKEN.inleiding.tekst}{" "}
                  <BronLink bron={STAND_VAN_ZAKEN.inleiding.bron} />
                </p>
                {STAND_VAN_ZAKEN.blokken.map((blok, bi) => (
                  <div key={bi} className={styles.standBlok}>
                    <h3 className={styles.standKop}>{blok.kop}</h3>
                    {blok.paragraaf && (
                      <p className={styles.standParagraaf}>
                        {blok.paragraaf.tekst} <BronLink bron={blok.paragraaf.bron} />
                      </p>
                    )}
                    {blok.punten && (
                      <ul className={styles.standLijst}>
                        {blok.punten.map((punt, pi) => (
                          <li key={pi}>
                            {punt.tekst} <BronLink bron={punt.bron} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={`${styles.sectie} ${toonNieuws ? styles.metScheiding : ""}`}>
        <button
          type="button"
          className={styles.kop}
          aria-expanded={verantwoordingOpen}
          aria-controls="zijkolom-verantwoording"
          onClick={() => setVerantwoordingOpen((v) => !v)}
        >
          <span className={styles.infoIcoon} aria-hidden="true">
            i
          </span>
          <span className={styles.kopTitel}>Technische verantwoording</span>
          <span className={styles.chevron} aria-hidden="true">
            {verantwoordingOpen ? "−" : "+"}
          </span>
        </button>
        <div className={`${styles.wikkel} ${verantwoordingOpen ? styles.open : ""}`}>
          <div
            id="zijkolom-verantwoording"
            role="region"
            aria-label="Technische verantwoording"
            className={styles.inhoud}
          >
            <div className={styles.verantwoordingInhoud}>
              {VERANTWOORDING.map((v) => (
                <div key={v.id} className={styles.verantwoordingModule}>
                  <h3 className={styles.verantwoordingKop}>{v.titel}</h3>
                  <p className={styles.verantwoordingBron}>
                    Bron:{" "}
                    <a href={v.bronUrl} target="_blank" rel="noopener noreferrer">
                      {v.bronNaam}
                    </a>
                    . Ververst elke {formatteerDuur(v.ververs)}.
                  </p>
                  {v.grenzen.map((grens, i) => (
                    <p key={i} className={styles.verantwoordingGrens}>
                      {grens}
                    </p>
                  ))}
                  {v.id === "waarschuwingen" && laatsteMelding && (
                    <p className={styles.verantwoordingGrens}>
                      Laatst gepubliceerde melding: {formatteerVolledig(laatsteMelding)}.
                    </p>
                  )}
                </div>
              ))}
              <p className={styles.verantwoordingSlot}>
                We tonen waar de cijfers vandaan komen en waar ze ophouden — niet meer dan dat.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatteerVolledig(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}
