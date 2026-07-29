"use client";

// "Leg uit"-knop (Functie B) voor de meet-popups. Eén knop per detectie, cluster
// of pluim die de cijfers in twee à drie zinnen duidt, mét schaalreferentie voor
// FRP. De server (/api/assistent, modus "uitleg") bouwt de context zelf uit de
// meegestuurde, getypeerde velden — er gaat geen vrije tekst naar het model — en
// cachet het antwoord per meting-id + datum. Deze knop staat VERPLICHT in beide
// kaartsystemen: de SVG-popup (FranceKaart) én de Leaflet-popup (Rookmodule).

import { useState } from "react";
import styles from "@/components/LegUit.module.css";

// Wat de client meestuurt. Alleen getypeerde, whitelisted velden; de server
// leest niets anders en stelt de prompttekst zelf samen.
export interface LegUitMeting {
  soort: "detectie" | "cluster" | "pluim";
  id: string;
  departementCode?: string | null;
  frp?: number | null;
  betrouwbaarheid?: string | null;
  cluster?: boolean;
  aantal?: number;
  waargenomenOp?: string | null;
  richting?: string | null;
}

export function LegUit({ meting, thema = "licht" }: { meting: LegUitMeting; thema?: "licht" | "donker" }) {
  const [antwoord, setAntwoord] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState(false);

  async function legUit() {
    if (bezig) return;
    if (antwoord) {
      setOpen((o) => !o); // al opgehaald: alleen in-/uitklappen
      return;
    }
    setBezig(true);
    setOpen(true);
    try {
      const res = await fetch("/api/assistent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modus: "uitleg", meting }),
      });
      const json = (await res.json().catch(() => null)) as { antwoord?: string } | null;
      setAntwoord(
        typeof json?.antwoord === "string" && json.antwoord.trim()
          ? json.antwoord
          : "De uitleg kon nu niet worden opgehaald. Probeer het later opnieuw."
      );
    } catch {
      setAntwoord("De uitleg kon nu niet worden opgehaald. Probeer het later opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const klasse = thema === "donker" ? styles.donker : styles.licht;

  return (
    <div className={`${styles.wikkel} ${klasse}`}>
      <button
        type="button"
        className={styles.knop}
        onClick={legUit}
        aria-expanded={open}
        disabled={bezig}
      >
        {bezig ? "Uitleg wordt opgehaald…" : antwoord ? (open ? "Uitleg verbergen" : "Uitleg tonen") : "Leg uit"}
      </button>
      {open && antwoord && <p className={styles.uitleg}>{antwoord}</p>}
    </div>
  );
}
