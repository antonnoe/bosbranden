"use client";

// Uitschuifbare zijlade — één instantie in de gedeelde schil (app-layout), zodat
// hij op ELKE route aanwezig is. Het is een overlay: fixed, buiten het gemeten
// omhulsel, zodat het openen/sluiten de embed-hoogtemelding niet beïnvloedt.

import { useEffect, useRef, useState } from "react";
import Zijkolom from "@/components/Zijkolom";
import styles from "@/components/Zijlade.module.css";

const SLEUTEL = "bosbranden-zijkolom";

export default function Zijlade() {
  const [open, setOpen] = useState(false);
  const [nieuwsAantal, setNieuwsAantal] = useState(0);
  const paneelRef = useRef<HTMLDivElement>(null);

  // Bewaarde open/dicht-stand teruglezen (sessionStorage, geen cookies).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SLEUTEL) === "open") setOpen(true);
    } catch {
      /* sessionStorage kan geblokkeerd zijn; dan blijft de lade ingeklapt */
    }
  }, []);

  // Stand bewaren, Escape-sluiten en focus naar het paneel bij openen.
  useEffect(() => {
    try {
      sessionStorage.setItem(SLEUTEL, open ? "open" : "dicht");
    } catch {
      /* stil */
    }
    if (!open) return;
    paneelRef.current?.focus();
    const opToets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", opToets);
    return () => window.removeEventListener("keydown", opToets);
  }, [open]);

  const label = nieuwsAantal > 0 ? `Nieuws (${nieuwsAantal})` : "Informatie";

  return (
    <div className={styles.schil}>
      <div className={`${styles.lade} ${open ? styles.open : ""}`}>
        <button
          type="button"
          className={styles.greep}
          aria-expanded={open}
          aria-controls="app-zijkolom"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.greepPijl} aria-hidden="true">
            {open ? "›" : "‹"}
          </span>
          {label}
        </button>
        <div
          id="app-zijkolom"
          className={styles.paneel}
          ref={paneelRef}
          tabIndex={-1}
          role="region"
          aria-label="Nieuws en technische verantwoording"
        >
          <Zijkolom onAantal={setNieuwsAantal} />
        </div>
      </div>
    </div>
  );
}
