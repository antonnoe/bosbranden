"use client";

// Uitschuifbare zijlade — één instantie in de gedeelde schil (app-layout), op
// ELKE route. De tabbladen staan in één vaste volgorde van boven naar beneden:
//   Start · Duiding · Verantwoording · Rookpaden · Nieuws · Infographics
// Navigatie-tabbladen (Start, Rookpaden) verlaten de pagina; paneel-tabbladen
// (Duiding, Verantwoording, Nieuws, Infographics) schuiven de lade uit. De
// oude groepsindeling is losgelaten om deze volgorde te kunnen aanhouden.
// De schil beslaat alleen het paneel + de rail (geen viewport-vullende laag);
// pointer-events staat uit op de schil en aan op rail en paneel.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ZijkolomNieuws, ZijkolomVerantwoording } from "@/components/Zijkolom";
import { ZijkolomDuiding } from "@/components/Duiding";
import { ZijkolomInfographics } from "@/components/Infographics";
import { useNieuws } from "@/components/Nieuws";
import styles from "@/components/Zijlade.module.css";

const SLEUTEL = "bosbranden-zijkolom";
type PaneelSoort = "nieuws" | "duiding" | "verantwoording" | "infographics";

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
      if (
        opgeslagen === "nieuws" ||
        opgeslagen === "duiding" ||
        opgeslagen === "verantwoording" ||
        opgeslagen === "infographics"
      )
        setPaneel(opgeslagen);
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

  // Paneel-tabblad: schuift de lade uit (blijft op de pagina).
  function paneelTab(soort: PaneelSoort, label: React.ReactNode) {
    return (
      <button
        type="button"
        className={`${styles.tab} ${styles.tabPaneel} ${paneel === soort ? styles.tabActief : ""}`}
        aria-expanded={paneel === soort}
        aria-controls="app-zijkolom"
        onClick={() => wissel(soort)}
      >
        {label}
      </button>
    );
  }

  // Navigatie-tabblad: interne route (blijft in het iframe). Op de eigen pagina
  // een niet-klikbare markering; anders een Link die een open paneel sluit (D1).
  function navTab(pad: string, label: string) {
    return pathname === pad ? (
      <span className={`${styles.tab} ${styles.tabNav} ${styles.tabHier}`} aria-current="page">
        {label}
      </span>
    ) : (
      <Link
        className={`${styles.tab} ${styles.tabNav}`}
        href={navHref(pad)}
        onClick={() => setPaneel(null)}
      >
        {label}
      </Link>
    );
  }

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
        aria-label={
          paneel === "verantwoording"
            ? "Technische verantwoording"
            : paneel === "duiding"
              ? "Duiding"
              : paneel === "infographics"
                ? "Infographics"
                : "Nieuws"
        }
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
          {paneel === "duiding" && <ZijkolomDuiding />}
          {paneel === "verantwoording" && <ZijkolomVerantwoording />}
          {paneel === "infographics" && <ZijkolomInfographics />}
        </div>
      </div>

      {/* Rail met tabbladen (altijd zichtbaar, aan de rechterrand). Eén vaste
          volgorde, navigatie en panelen door elkaar:
          Start · Duiding · Verantwoording · Rookpaden · Nieuws · Infographics */}
      <div className={styles.rail}>
        {navTab("/start", "Start")}
        {paneelTab("duiding", "Duiding")}
        {paneelTab(
          "verantwoording",
          <>
            <span className={styles.labelVol}>Verantwoording</span>
            <span className={styles.labelKort}>Info</span>
          </>
        )}
        {navTab("/rook", "Rookpaden")}
        {paneelTab("nieuws", nieuws.data ? `Nieuws (${nieuws.aantal})` : "Nieuws")}
        {paneelTab("infographics", "Infographics")}
      </div>
    </div>
  );
}
