"use client";

// Uitschuifbare lade + navigatie — één instantie in de gedeelde schil
// (app-layout), op ELKE route. Eén navigatiepatroon op alle breedtes: links een
// segmented control met DRIE doelen (Start · Kaart · Rookpaden), rechts twee
// knoppen die de lade openen (Nieuws met teller, Uitleg & bronnen). Achter
// "Uitleg & bronnen" komen Bronnen, Duiding en Infographics samen in één lade met
// interne tabs. De schil beslaat alleen het paneel (geen viewport-vullende laag);
// pointer-events staat uit op de schil en aan op het paneel.

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

// Interne tabs binnen de "Uitleg & bronnen"-lade, in vaste volgorde (Bronnen eerst).
const UITLEG_TABS: { id: UitlegTab; label: string }[] = [
  { id: "bronnen", label: "Bronnen" },
  { id: "duiding", label: "Duiding" },
  { id: "infographics", label: "Infographics" },
];

const NIEUWS_ICOON = (
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
    <path d="M4 5h13v14H5a1 1 0 0 1-1-1z" />
    <path d="M17 8h3v9a2 2 0 0 1-2 2" />
    <path d="M7 8h7M7 12h7M7 16h4" />
  </svg>
);

const UITLEG_ICOON = (
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
);

export default function Zijlade() {
  const pathname = usePathname();
  const [paneel, setPaneel] = useState<PaneelSoort | null>(null);
  const [uitlegTab, setUitlegTab] = useState<UitlegTab>("bronnen");
  // Welk onderdeel het laatst open stond (nieuws of uitleg). We onthouden alleen
  // dít, niet DÁT de lade open was: bij het laden blijft de lade dicht (1.3).
  const [laatstePaneel, setLaatstePaneel] = useState<PaneelSoort>("uitleg");
  const [query, setQuery] = useState("");
  const paneelRef = useRef<HTMLDivElement>(null);
  const schilRef = useRef<HTMLDivElement>(null);

  // Nieuws wordt op schilniveau opgehaald en zichzelf ververst, zodat de teller
  // op de Nieuws-knop live blijft, óók als de lade dicht is.
  const nieuws = useNieuws();

  // Bewaarde stand teruglezen (sessionStorage, geen cookies): alleen wélk
  // onderdeel het laatst gebruikt is, NIET dat de lade open stond. De lade blijft
  // dus dicht bij het laden (1.3). Oude paneelwaarden (duiding/verantwoording/
  // infographics) worden naar "uitleg" gemigreerd; de bijbehorende interne tab
  // wordt hersteld, zodat bewaarde standen van vóór de samenvoeging niet breken.
  useEffect(() => {
    try {
      const opgeslagen = sessionStorage.getItem(SLEUTEL);
      const soort = migreerPaneelSleutel(opgeslagen);
      if (soort) {
        setLaatstePaneel(soort);
        if (soort === "uitleg") setUitlegTab(beginUitlegTab(opgeslagen));
      }
    } catch {
      /* sessionStorage kan geblokkeerd zijn; dan geldt de standaard */
    }
  }, []);

  // Zodra een onderdeel opengaat, onthouden we dat als laatst gebruikte onderdeel.
  useEffect(() => {
    if (paneel) setLaatstePaneel(paneel);
  }, [paneel]);

  // Behoud embed/postcode in de navigatielinks; herlezen bij een routewissel.
  useEffect(() => {
    setQuery(typeof window !== "undefined" ? window.location.search : "");
  }, [pathname]);

  // Laatst gebruikte onderdeel bewaren (onafhankelijk van open/dicht). Voor het
  // uitleg-paneel bewaren we de actieve interne tab als sleutelwaarde.
  useEffect(() => {
    try {
      const teBewaren = laatstePaneel === "uitleg" ? uitlegTab : laatstePaneel;
      sessionStorage.setItem(SLEUTEL, teBewaren);
    } catch {
      /* stil */
    }
  }, [laatstePaneel, uitlegTab]);

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
  // niet-klikbare markering met aria-current, anders een Link die een open lade
  // sluit.
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

  // Lade-knop (Nieuws / Uitleg & bronnen): opent de lade op dat onderdeel, of sluit
  // als het al open is. Boven 768px met tekstlabel, eronder als icoon met badge;
  // de aria-label houdt beide leesbaar (de zichtbare tekst is aria-hidden zodat er
  // niets dubbel wordt voorgelezen).
  function ladeKnop(
    soort: PaneelSoort,
    label: string,
    icoon: React.ReactNode,
    teller?: React.ReactNode
  ) {
    const actief = paneel === soort;
    return (
      <button
        type="button"
        className={`${styles.ladeKnop} ${actief ? styles.ladeKnopActief : ""}`}
        aria-expanded={actief}
        aria-controls="app-zijkolom"
        aria-label={label}
        title={label}
        onClick={() => setPaneel((h) => (h === soort ? null : soort))}
      >
        <span className={styles.ladeIcoon} aria-hidden="true">
          {icoon}
        </span>
        <span className={styles.ladeLabel} aria-hidden="true">
          {label}
        </span>
        {teller}
      </button>
    );
  }

  return (
    <>
      {/* Navigatierij bovenaan op ALLE breedtes: links de segmented control
          (Start / Kaart / Rookpaden), rechts de twee lade-knoppen. Sticky bovenaan
          het contentgebied. */}
      <div className={styles.navKop}>
        <div className={styles.mobielNav} role="group" aria-label="Navigatie">
          {navKnop("/start", "Start")}
          {navKnop("/", "Kaart")}
          {navKnop("/rook", "Rookpaden")}
        </div>
        <div className={styles.ladeKnoppen} role="group" aria-label="Lees erbij">
          {ladeKnop(
            "nieuws",
            "Nieuws",
            NIEUWS_ICOON,
            nieuws.data && nieuws.aantal > 0 ? (
              <span className={styles.leesBadge}>{nieuws.aantal}</span>
            ) : null
          )}
          {ladeKnop("uitleg", "Uitleg & bronnen", UITLEG_ICOON)}
        </div>
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

        {/* Paneel (schuift uit vanaf de rechterrand). Met de lade dicht staat het
            paneel op inert (naast aria-hidden), zodat Tab er geen enkel element in
            bereikt terwijl het weggeschoven is (1.4). Escape/overlay/veeg en het
            terugzetten van de focus blijven ongewijzigd. */}
        <div
          id="app-zijkolom"
          className={`${styles.paneel} ${open ? styles.paneelOpen : ""}`}
          ref={paneelRef}
          tabIndex={-1}
          role="region"
          aria-label={paneel === "uitleg" ? "Uitleg & bronnen" : "Nieuws"}
          aria-hidden={!open}
          inert={!open}
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
            {/* Schakel Nieuws / Uitleg & bronnen binnen de lade — op alle breedtes
                de manier om te wisselen terwijl de lade open is (de kop-knoppen
                zitten dan achter de lade). */}
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
                Uitleg &amp; bronnen
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
