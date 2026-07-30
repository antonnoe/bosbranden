"use client";

// Uitschuifbare zijlade — één instantie in de gedeelde schil (app-layout), op
// ELKE route. De rail heeft vijf tabs in twee groepen, onderscheiden via VORM:
//   massief (bordeaux, geen rand)  = navigatie: Start · Kaart · Rookpaden
//   omlijnd (wit, bordeaux rand)   = lade:      Nieuws · Verantwoording
// Achter "Verantwoording" komen Bronnen, Duiding en Infographics samen in één
// lade met interne tabs. De schil beslaat alleen het paneel + de rail (geen
// viewport-vullende laag); pointer-events staat uit op de schil en aan op rail
// en paneel.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ZijkolomNieuws } from "@/components/Zijkolom";
import { ZijkolomDuiding } from "@/components/Duiding";
import { ZijkolomInfographics } from "@/components/Infographics";
import { ZijkolomBronnen } from "@/components/Bronnen";
import { useNieuws } from "@/components/Nieuws";
import {
  migreerPaneelSleutel,
  beginUitlegTab,
  type PaneelSoort,
  type UitlegTab,
} from "@/lib/zijlade-migratie";
import styles from "@/components/Zijlade.module.css";

const SLEUTEL = "bosbranden-zijkolom";

// Interne tabs binnen de Verantwoording-lade, in vaste volgorde (Bronnen eerst).
const UITLEG_TABS: { id: UitlegTab; label: string }[] = [
  { id: "bronnen", label: "Bronnen" },
  { id: "duiding", label: "Duiding" },
  { id: "infographics", label: "Infographics" },
];

export default function Zijlade() {
  const pathname = usePathname();
  const [paneel, setPaneel] = useState<PaneelSoort | null>(null);
  const [uitlegTab, setUitlegTab] = useState<UitlegTab>("bronnen");
  const [query, setQuery] = useState("");
  const paneelRef = useRef<HTMLDivElement>(null);
  const schilRef = useRef<HTMLDivElement>(null);

  // Nieuws wordt op railniveau opgehaald en zichzelf ververst, zodat de teller
  // op het Nieuws-tabblad live blijft, óók als de lade dicht is.
  const nieuws = useNieuws();

  // Bewaarde open-stand teruglezen (sessionStorage, geen cookies). Oude
  // paneelwaarden (duiding/verantwoording/infographics) worden naar "uitleg"
  // gemigreerd; de bijbehorende interne tab wordt hersteld, zodat bewaarde
  // standen van vóór de samenvoeging niet breken.
  useEffect(() => {
    try {
      const opgeslagen = sessionStorage.getItem(SLEUTEL);
      const soort = migreerPaneelSleutel(opgeslagen);
      if (soort) {
        setPaneel(soort);
        if (soort === "uitleg") setUitlegTab(beginUitlegTab(opgeslagen));
      }
    } catch {
      /* sessionStorage kan geblokkeerd zijn; dan blijft de lade dicht */
    }
  }, []);

  // Behoud embed/postcode in de navigatielinks; herlezen bij een routewissel.
  useEffect(() => {
    setQuery(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  // Stand bewaren. Voor het uitleg-paneel bewaren we de actieve interne tab als
  // sleutelwaarde; migreerPaneelSleutel mapt die bij terugkeer weer op "uitleg"
  // en beginUitlegTab herstelt de tab. Een dichte lade bewaart "dicht".
  useEffect(() => {
    try {
      const teBewaren = paneel === "uitleg" ? uitlegTab : paneel ?? "dicht";
      sessionStorage.setItem(SLEUTEL, teBewaren);
    } catch {
      /* stil */
    }
  }, [paneel, uitlegTab]);

  // Escape-sluiten en focus naar het paneel bij openen. Klikken náást het paneel
  // gaat via de overlay (onder), niet via een document-listener: zo sluit één
  // klik op de kaart de lade zónder tegelijk een pin te selecteren (A2).
  useEffect(() => {
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

  // Paneel-tabblad: schuift de lade uit (blijft op de pagina). Gestippelde rand
  // ("Lees erbij") — de vorm zegt: dit schuift uit, het verlaat de pagina niet.
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
  // een niet-klikbare, duidelijk gevulde markering; anders een Link die een open
  // paneel sluit (D1). Massieve vorm ("Waar ben ik").
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
      {/* Klik-vanger die de hele viewport bedekt zodra de lade open is (A2). */}
      {open && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Zijlade sluiten"
          tabIndex={-1}
          onClick={() => setPaneel(null)}
        />
      )}

      {/* Paneel (schuift uit); links van de rail. */}
      <div
        id="app-zijkolom"
        className={`${styles.paneel} ${open ? styles.paneelOpen : ""}`}
        ref={paneelRef}
        tabIndex={-1}
        role="region"
        aria-label={paneel === "uitleg" ? "Verantwoording" : "Nieuws"}
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
          {paneel === "uitleg" && (
            <>
              {/* Interne tabs: Duiding · Verantwoording · Infographics. */}
              <div className={styles.uitlegTabs} role="tablist" aria-label="Uitleg-onderdelen">
                {UITLEG_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={uitlegTab === t.id}
                    className={`${styles.uitlegTab} ${
                      uitlegTab === t.id ? styles.uitlegTabActief : ""
                    }`}
                    onClick={() => setUitlegTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {uitlegTab === "bronnen" && <ZijkolomBronnen />}
              {uitlegTab === "duiding" && <ZijkolomDuiding />}
              {uitlegTab === "infographics" && <ZijkolomInfographics />}
            </>
          )}
        </div>
      </div>

      {/* Rail met twee groepen, onderscheiden via vorm (massief = navigatie,
          omlijnd = lade). Geen groepslabels; alleen een kort streepje ertussen. */}
      <div className={styles.rail}>
        <div className={styles.railGroep}>
          {navTab("/start", "Start")}
          {navTab("/", "Kaart")}
          {navTab("/rook", "Rookpaden")}
        </div>

        <div className={styles.scheiding} aria-hidden="true" />

        <div className={styles.railGroep}>
          {paneelTab(
            "nieuws",
            <>
              Nieuws
              {nieuws.data ? <span className={styles.telPil}>{nieuws.aantal}</span> : null}
            </>
          )}
          {paneelTab("uitleg", "Verantwoording")}
        </div>
      </div>
    </div>
  );
}
