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

  // Stand bewaren, Escape-sluiten en focus naar het paneel bij openen. Klikken
  // náást het paneel gaat via de overlay (onder), niet meer via een
  // document-listener: zo sluit één klik op de kaart de lade zónder tegelijk een
  // pin te selecteren of in te zoomen (A2).
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
    window.addEventListener("keydown", opToets);
    return () => window.removeEventListener("keydown", opToets);
  }, [paneel]);

  function wissel(soort: PaneelSoort) {
    setPaneel((huidig) => (huidig === soort ? null : soort));
  }

  // Naar rechts vegen sluit het paneel (A2, aanraakschermen). We meten alleen de
  // horizontale verplaatsing en negeren verticaal scrollen.
  const veegRef = useRef<{ x: number; y: number } | null>(null);
  function opVeegStart(e: React.TouchEvent) {
    const t = e.touches[0];
    veegRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  }
  function opVeegEind(e: React.TouchEvent) {
    const start = veegRef.current;
    veegRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dx > 60 && Math.abs(dx) > Math.abs(dy)) setPaneel(null);
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
      {/* Klik-vanger die de hele viewport bedekt zodra de lade open is: een klik
          ernaast (ook op de kaart) sluit de lade en bereikt de kaart niet, dus
          er wordt geen pin geselecteerd of ingezoomd (A2). Ligt vóór de kaart
          maar áchter paneel en rail (DOM-volgorde), die hun eigen klikken houden. */}
      {open && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Zijlade sluiten"
          tabIndex={-1}
          onClick={() => setPaneel(null)}
        />
      )}

      {/* Paneel (schuift uit); links van de rail. Het paneel zelf scrollt niet:
          een vaste sluitrand links + een scrollende inhoudskolom. */}
      <div
        id="app-zijkolom"
        className={`${styles.paneel} ${open ? styles.paneelOpen : ""}`}
        ref={paneelRef}
        tabIndex={-1}
        role="region"
        aria-label={paneel === "verantwoording" ? "Technische verantwoording" : "Nieuws"}
        aria-hidden={!open}
        onTouchStart={opVeegStart}
        onTouchEnd={opVeegEind}
      >
        {open && (
          <button
            type="button"
            className={styles.sluitRand}
            aria-label="Zijlade sluiten"
            onClick={() => setPaneel(null)}
          >
            <span className={styles.sluitRandTeken} aria-hidden="true">
              ×
            </span>
            <span className={styles.sluitRandLabel} aria-hidden="true">
              Sluiten
            </span>
          </button>
        )}
        <div className={styles.paneelInhoud}>
          {paneel === "nieuws" && <ZijkolomNieuws haal={nieuws} />}
          {paneel === "verantwoording" && <ZijkolomVerantwoording />}
        </div>
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
              <Link
                key={pad}
                className={`${styles.tab} ${styles.tabNav}`}
                href={navHref(pad)}
                // D1: navigeren naar een andere toolpagina sluit een open paneel,
                // zodat de nieuwe pagina met vrij zicht opent. Paneel↔paneel
                // wisselen (Nieuws ↔ Verantwoording) blijft ongemoeid.
                onClick={() => setPaneel(null)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
