"use client";

// Zijkolom van /start: samengevoegde nieuwsfeiten (handmatig + /api/nieuws) en
// een uitklapbare technische verantwoording. Puur additief.

import { useEffect, useState } from "react";
import { NIEUWSFEITEN, type Nieuwsfeit } from "@/data/nieuwsfeiten";
import { VERVERS_SECONDEN, formatteerDuur } from "@/lib/cache";
import styles from "@/components/Zijkolom.module.css";

interface NieuwsApiItem {
  titel: string;
  url: string;
  bron: string;
  gepubliceerdOp: string | null;
}

interface GecombineerdItem {
  tijd: string | null;
  tekst: string;
  bron?: string;
  url?: string;
  zwaar?: boolean;
}

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

export default function Zijkolom({
  embed,
  onAantal,
}: {
  embed: boolean;
  onAantal?: (aantal: number) => void;
}) {
  const [nieuwsItems, setNieuwsItems] = useState<NieuwsApiItem[] | null>(null);
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

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/nieuws");
        const json: { beschikbaar?: boolean; items?: NieuwsApiItem[] } = await res.json();
        if (actief) setNieuwsItems(json.beschikbaar && Array.isArray(json.items) ? json.items : []);
      } catch {
        if (actief) setNieuwsItems([]);
      }
    })();
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

  const maxItems = embed ? 3 : 8;
  const items: GecombineerdItem[] = [
    ...NIEUWSFEITEN.map((f: Nieuwsfeit) => ({
      tijd: f.tijd,
      tekst: f.tekst,
      bron: f.bron,
      url: f.url,
      zwaar: f.zwaar,
    })),
    ...(nieuwsItems ?? []).map((n) => ({
      tijd: n.gepubliceerdOp,
      tekst: n.titel,
      bron: n.bron,
      url: n.url,
      zwaar: false,
    })),
  ]
    .sort((a, b) => tijdWaarde(b.tijd) - tijdWaarde(a.tijd))
    .slice(0, maxItems);

  const toonNieuws = items.length > 0;

  // Meld het aantal nieuwsitems terug aan de ouder, zodat de handgreep van de
  // uitschuifbare zijkolom een teller kan tonen ("Nieuws (3)").
  useEffect(() => {
    onAantal?.(items.length);
  }, [items.length, onAantal]);

  return (
    <div className={styles.zijkolom}>
      {toonNieuws && (
        <section className={styles.sectie}>
          <button
            type="button"
            className={styles.kop}
            aria-expanded={nieuwsOpen}
            aria-controls="zijkolom-nieuws"
            onClick={() => setNieuwsOpen((v) => !v)}
          >
            <span className={styles.kopTitel}>Nieuws ({items.length})</span>
            <span className={styles.chevron} aria-hidden="true">
              {nieuwsOpen ? "−" : "+"}
            </span>
          </button>
          <div className={`${styles.wikkel} ${nieuwsOpen ? styles.open : ""}`}>
            <div
              id="zijkolom-nieuws"
              role="region"
              aria-label="Nieuws"
              className={styles.inhoud}
            >
              <ul className={styles.nieuwsLijst}>
                {items.map((item, i) => (
                  <li
                    key={`${item.url ?? item.tekst}-${i}`}
                    className={`${styles.nieuwsItem} ${item.zwaar ? styles.zwaar : ""}`}
                  >
                    <span className={styles.nieuwsTijd}>{formatteerNieuwsTijd(item.tijd)}</span>
                    <span className={styles.nieuwsTekst}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          {item.tekst}
                        </a>
                      ) : (
                        item.tekst
                      )}
                      {item.bron ? (
                        <span className={styles.nieuwsBron}> · {item.bron}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
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

function tijdWaarde(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function formatteerNieuwsTijd(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const nu = new Date();
  const zelfdeDag =
    d.getUTCFullYear() === nu.getUTCFullYear() &&
    d.getUTCMonth() === nu.getUTCMonth() &&
    d.getUTCDate() === nu.getUTCDate();
  if (zelfdeDag) {
    return new Intl.DateTimeFormat("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    }).format(d);
  }
  const gisteren = new Date(nu);
  gisteren.setUTCDate(nu.getUTCDate() - 1);
  const isGisteren =
    d.getUTCFullYear() === gisteren.getUTCFullYear() &&
    d.getUTCMonth() === gisteren.getUTCMonth() &&
    d.getUTCDate() === gisteren.getUTCDate();
  if (isGisteren) return "gisteren";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  }).format(d);
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
