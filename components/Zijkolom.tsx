"use client";

// Inhoud van de uitschuifbare lade, opgesplitst in twee losse panelen die de
// rail-tabbladen tonen: "Nieuws" (het Stand van zaken-blok) en "Verantwoording"
// (de technische verantwoording). Bordeaux paneel; wit wordt in de CSS technisch
// afgedwongen. De bestaande link-opmaak (target/rel) blijft ongewijzigd.

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

// Aantal afzonderlijk gebronde uitspraken in het nieuwsblok, voor de teller op
// het Nieuws-tabblad ("Nieuws (8)"). Data-afgeleid, niet hardcoded.
export const NIEUWS_AANTAL = STAND_VAN_ZAKEN
  ? 1 +
    STAND_VAN_ZAKEN.blokken.reduce(
      (n, blok) => n + (blok.paragraaf ? 1 : 0) + (blok.punten?.length ?? 0),
      0
    )
  : 0;

// Bronlink: zelfde link-opmaak als de overige bronlinks in de zijkolom.
function BronLink({ bron }: { bron: StandBron }) {
  return (
    <a className={styles.standBron} href={bron.url} target="_blank" rel="noopener noreferrer">
      {bron.label}
    </a>
  );
}

// ---- Paneel 1: Nieuws (Stand van zaken) ----
export function ZijkolomNieuws() {
  if (!STAND_VAN_ZAKEN) {
    return <p className={styles.leeg}>Op dit moment geen nieuws te melden.</p>;
  }
  return (
    <div className={styles.stand}>
      <p className={styles.standDatum}>{STAND_VAN_ZAKEN.titel}</p>
      <p className={styles.standInleiding}>
        {STAND_VAN_ZAKEN.inleiding.tekst} <BronLink bron={STAND_VAN_ZAKEN.inleiding.bron} />
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
          {blok.praktischeLinks && (
            <ul className={styles.standPraktischLijst}>
              {blok.praktischeLinks.map((link, li) => (
                <li key={li}>
                  <a
                    className={styles.standPraktisch}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.tekst}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Paneel 2: Technische verantwoording ----
export function ZijkolomVerantwoording() {
  const [laatsteMelding, setLaatsteMelding] = useState<string | null>(null);

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

  return (
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
