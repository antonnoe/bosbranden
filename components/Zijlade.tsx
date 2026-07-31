"use client";

// Uitschuifbare lade + navigatie — één instantie in de gedeelde schil
// (app-layout), op ELKE route. Eén navigatiepatroon op alle breedtes: een
// segmented control (Start · Kaart) plus één leesmateriaal-knop die de lade
// opent. Rookpaden is geen navigatiedoel; /rook blijft als URL bereikbaar (via
// het hittebronnenblok). Achter de leesknop komen Nieuws en Verantwoording
// samen in één lade, met interne tabs Bronnen · Duiding · Infographics. De schil
// beslaat alleen het paneel (geen viewport-vullende laag); pointer-events staat
// uit op de schil en aan op het paneel.

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

  // Nieuws wordt op schilniveau opgehaald en zichzelf ververst, zodat de teller
  // op de leesknop live blijft, óók als de lade dicht is.
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

  // Navigatieknop (segmented control): interne route; op de eigen route een
  // niet-klikbare markering, anders een Link die een open lade sluit.
  function navKnop(pad: string, label: string) {
    return pathname === pad ? (
      <span className={`${styles.mobielNavKnop} ${styles.mobielNavActief}`} aria-current="page">
        {label}
      </span>
    ) : (
      <Link className={styles.mobielNavKnop} href={navHref(pad)} onClick={() => setPaneel(null)}>
        {label}
      </Link>
    );
  }

  return (
    <>
      {/* Navigatierij bovenaan op ALLE breedtes: de segmented control (Start /
          Kaart) links, de leesmateriaal-knop rechts. Sticky bovenaan het
          contentgebied. */}
      <div className={styles.navKop}>
        <div className={styles.mobielNav} role="group" aria-label="Navigatie">
          {navKnop("/start", "Start")}
          {navKnop("/", "Kaart")}
        </div>
        <button
          type="button"
          className={styles.leesIcoon}
          aria-label="Lees erbij: nieuws en verantwoording"
          aria-expanded={open}
          aria-controls="app-zijkolom"
          onClick={() => setPaneel((h) => (h ? null : "uitleg"))}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" />
            <path d="M9 8h6M9 12h6M9 16h4" />
          </svg>
          {/* Zichtbaar label boven 768px (CSS). aria-hidden zodat de aria-label
              van de knop niet dubbel wordt voorgelezen. */}
          <span className={styles.leesLabel} aria-hidden="true">
            Uitleg &amp; bronnen
          </span>
          {nieuws.data && nieuws.aantal > 0 ? (
            <span className={styles.leesBadge}>{nieuws.aantal}</span>
          ) : null}
        </button>
      </div>

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

        {/* Paneel (schuift uit vanaf de rechterrand). */}
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
          {/* Sluitknop (✕) rechtsboven; onder 768px zichtbaar (boven 768px sluit
              de linker sluitrand). */}
          {open && (
            <button
              type="button"
              className={styles.mobielSluit}
              aria-label="Sluiten"
              onClick={() => setPaneel(null)}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
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
            {/* Schakel Nieuws / Verantwoording binnen de lade — op alle breedtes
                de manier om tussen beide te wisselen. */}
            <div className={styles.mobielLadeSchakel} role="group" aria-label="Kies onderdeel">
              <button
                type="button"
                className={`${styles.mobielLadeKnop} ${paneel === "nieuws" ? styles.mobielLadeActief : ""}`}
                aria-pressed={paneel === "nieuws"}
                onClick={() => setPaneel("nieuws")}
              >
                Nieuws
                {nieuws.data && nieuws.aantal > 0 ? (
                  <span className={styles.telPil}>{nieuws.aantal}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={`${styles.mobielLadeKnop} ${paneel === "uitleg" ? styles.mobielLadeActief : ""}`}
                aria-pressed={paneel === "uitleg"}
                onClick={() => setPaneel("uitleg")}
              >
                Verantwoording
              </button>
            </div>
            {paneel === "nieuws" && <ZijkolomNieuws haal={nieuws} />}
            {paneel === "uitleg" && (
              <>
                {/* Interne tabs: Bronnen · Duiding · Infographics. */}
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
      </div>
    </>
  );
}
