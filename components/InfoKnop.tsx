"use client";

// Herbruikbaar [i]-knopje: een klein rond knopje dat bij klik of tik een kort
// uitlegblokje opent. Sluit via Escape, klik-ernaast én een eigen sluitknop.
// Het uitlegblokje verschijnt als blok in de tekststroom (geen zwevend laagje),
// zodat het op smalle vensters nooit horizontale overloop of afsnijding geeft.
// Klikdoel is minimaal 44px (via een onzichtbaar vergroot trefvlak); de tekst
// zelf blijft klein en inline naast de term staan.

import { useEffect, useId, useRef, useState } from "react";
import styles from "@/components/InfoKnop.module.css";

export default function InfoKnop({
  kop,
  tekst,
  label,
}: {
  kop: string;
  tekst: string;
  // Toegankelijk label; standaard afgeleid van de kop.
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const knopRef = useRef<HTMLButtonElement>(null);
  const blokId = useId();

  // Klik-ernaast sluit het blokje. Klikken op het knopje zelf valt binnen de
  // wrap en wordt hier genegeerd, zodat de knop gewoon blijft togglen.
  useEffect(() => {
    if (!open) return;
    const opBuitenklik = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", opBuitenklik);
    return () => document.removeEventListener("mousedown", opBuitenklik);
  }, [open]);

  return (
    <span
      className={styles.wrap}
      ref={wrapRef}
      onKeyDown={(e) => {
        // Escape sluit éérst dit blokje, en mag niet doorlekken naar de
        // kaartpopup (die luistert ook op Escape).
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          knopRef.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={knopRef}
        className={styles.knop}
        aria-label={label ?? `Uitleg: ${kop}`}
        aria-expanded={open}
        aria-controls={blokId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <span className={styles.blok} id={blokId} role="note">
          <strong className={styles.blokKop}>{kop}</strong>
          <span className={styles.blokTekst}>{tekst}</span>
          <button
            type="button"
            className={styles.blokSluit}
            onClick={() => {
              setOpen(false);
              knopRef.current?.focus();
            }}
          >
            Sluiten
          </button>
        </span>
      )}
    </span>
  );
}
