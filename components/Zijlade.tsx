"use client";

// Uitschuifbare zijlade — één instantie in de gedeelde schil (app-layout), op
// ELKE route. De rail heeft twee soorten tabbladen, visueel gescheiden:
//   Groep 1 (PANELEN, blijf op de pagina):   Nieuws (n) · Verantwoording
//   Groep 2 (NAVIGATIE, verlaat de pagina):  Start · Rook
// De schil beslaat alleen het paneel + de rail (geen viewport-vullende laag);
// pointer-events staat uit op de schil en aan op rail en paneel.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ZijkolomNieuws, ZijkolomVerantwoording } from "@/components/Zijkolom";
import { useNieuws } from "@/components/Nieuws";
import styles from "@/components/Zijlade.module.css";

const SLEUTEL = "bosbranden-zijkolom";
type PaneelSoort = "nieuws" | "verantwoording";

const NAVIGATIE: Array<{ pad: string; label: string }> = [
  { pad: "/start", label: "Start" },
  { pad: "/rook", label: "Rook" },
];

export default function Zijlade() {
  const pathname = usePathname();
  const [paneel, setPaneel] = useState<PaneelSoort | null>(null);
  const [query, setQuery] = useState("");
  const paneelRef = useRef<HTMLDivElement>(null);
  const schilRef = useRef<HTMLDivElement>(null);

  // Nieuws wordt op railniveau opgehaald en zichzelf ververst, zodat de teller
  // op het Nieuws-tabblad live blijft, óók als de lade dicht is.
  const nieuws = useNieuws();

  // Bewaarde open-stand teruglezen (sessionStorage, geen cookies).
  useEffect(() => {
    try {
      const opgeslagen = sessionStorage.getItem(SLEUTEL);
      if (opgeslagen === "nieuws" || opgeslagen === "verantwoording") setPaneel(opgeslagen);
    } catch {
      /* sessionStorage kan geblokkeerd zijn; dan blijft de lade dicht */
    }
  }, []);

  // Behoud embed/postcode in de navigatielinks; herlezen bij een routewissel.
  useEffect(() => {
    setQuery(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  // Stand bewaren, Escape-sluiten en focus naar het paneel bij openen.
  useEffect(() => {
    try {
      sessionStorage.setItem(SLEUTEL, paneel ?? "dicht");
    } catch {
      /* stil */
    }
    if (!paneel) return;
    paneelRef.current?.focus();
    const opToets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPaneel(null);
    };
    // Klik buiten paneel én rail sluit de lade. De schil (paneel + rail) heeft
    // pointer-events:none op zichzelf, dus een klik op de kaart komt hier terecht
    // met een doel buiten schilRef; een klik op tab of paneel valt er binnen.
    const opKlikBuiten = (e: PointerEvent) => {
      const doel = e.target as Node | null;
      if (doel && schilRef.current && !schilRef.current.contains(doel)) {
        setPaneel(null);
      }
    };
    window.addEventListener("keydown", opToets);
    document.addEventListener("pointerdown", opKlikBuiten);
    return () => {
      window.removeEventListener("keydown", opToets);
      document.removeEventListener("pointerdown", opKlikBuiten);
    };
  }, [paneel]);

  function wissel(soort: PaneelSoort) {
    setPaneel((huidig) => (huidig === soort ? null : soort));
  }

  function navHref(pad: string): string {
    const params = new URLSearchParams(query);
    const nieuw = new URLSearchParams();
    if (params.get("embed") === "1") nieuw.set("embed", "1");
    const pc = params.get("postcode");
    if (pc) nieuw.set("postcode", pc);
    const qs = nieuw.toString();
    return qs ? `${pad}?${qs}` : pad;
  }

  const open = paneel !== null;

  return (
    <div className={styles.schil} ref={schilRef}>
      {/* Paneel (schuift uit); links van de rail. */}
      <div
        id="app-zijkolom"
        className={`${styles.paneel} ${open ? styles.paneelOpen : ""}`}
        ref={paneelRef}
        tabIndex={-1}
        role="region"
        aria-label={paneel === "verantwoording" ? "Technische verantwoording" : "Nieuws"}
        aria-hidden={!open}
      >
        {open && (
          <button
            type="button"
            className={styles.paneelSluit}
            aria-label="Zijlade sluiten"
            onClick={() => setPaneel(null)}
          >
            <span aria-hidden="true">×</span>
            <span className={styles.paneelSluitLabel}>Sluiten</span>
          </button>
        )}
        {paneel === "nieuws" && <ZijkolomNieuws haal={nieuws} />}
        {paneel === "verantwoording" && <ZijkolomVerantwoording />}
      </div>

      {/* Rail met tabbladen (altijd zichtbaar, aan de rechterrand). */}
      <div className={styles.rail}>
        {/* Groep 1 — PANELEN */}
        <button
          type="button"
          className={`${styles.tab} ${styles.tabPaneel} ${paneel === "nieuws" ? styles.tabActief : ""}`}
          aria-expanded={paneel === "nieuws"}
          aria-controls="app-zijkolom"
          onClick={() => wissel("nieuws")}
        >
          {nieuws.data ? `Nieuws (${nieuws.aantal})` : "Nieuws"}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${styles.tabPaneel} ${paneel === "verantwoording" ? styles.tabActief : ""}`}
          aria-expanded={paneel === "verantwoording"}
          aria-controls="app-zijkolom"
          onClick={() => wissel("verantwoording")}
        >
          <span className={styles.labelVol}>Verantwoording</span>
          <span className={styles.labelKort}>Info</span>
        </button>

        {/* Duidelijke scheiding tussen panelen en navigatie. */}
        <span className={styles.scheiding} aria-hidden="true" />

        {/* Groep 2 — NAVIGATIE (interne routes, blijft in het iframe) */}
        <nav className={styles.nav} aria-label="Ga naar toolpagina">
          {NAVIGATIE.map(({ pad, label }) => {
            const actief = pathname === pad;
            return actief ? (
              <span
                key={pad}
                className={`${styles.tab} ${styles.tabNav} ${styles.tabHier}`}
                aria-current="page"
              >
                {label}
              </span>
            ) : (
              <Link key={pad} className={`${styles.tab} ${styles.tabNav}`} href={navHref(pad)}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
