"use client";

// Beslisscherm (/start). De bezoeker beantwoordt twee vragen: is er nú iets
// gemeten (Hittebronnen), en wordt het morgen gevaarlijk (Brandgevaar)? Plus de
// officiële stand (FR-Alert). De blokken staan in een vaste volgorde,
// gegroepeerd op tijd; er wordt nooit gesorteerd op ernst, zodat na binnenkomst
// van de status niets verspringt. Elk blok toont zijn herkomst expliciet.

import { useEffect, useMemo, useState } from "react";
import { MODULES, GROEP_KOPPEN, ROOK_ACTIE, type Tijdgroep } from "@/lib/modules";
import { departementVoorPostcode, DEP_BY_CODE } from "@/lib/departements";
import { departementenBinnenStraal } from "@/lib/departement-middelpunt";
import { NIVEAUS, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import type { ModuleStatus } from "@/app/api/status/route";
import type { WaarnemingenAntwoord } from "@/lib/waarnemingen";
import EmbedHoogte from "@/components/EmbedHoogte";
import Voortgang from "@/components/Voortgang";
import Postcode from "@/components/Postcode";
import styles from "@/components/Start.module.css";

const LAAD_FASEN = [
  "Actuele status ophalen…",
  "Brandgevaar, hittebronnen en meldingen samenvatten…",
  "Blokken klaarzetten…",
];

const GEDUPEERD_URL =
  "https://infofrankrijk.com/gedupeerd-door-natuurgeweld-in-frankrijk-uw-verzekering-goed-regelen/";

// Ernst-accent voor de border-left: één ramp in de gevaarniveau-kleuren, zodat
// de linkerrand van elk blok altijd hetzelfde betekent — gevaarniveau, nooit
// merk. Ernst 0 / geen data blijft neutraal grijs.
const ERNST_ACCENT: Record<number, string> = {
  0: "var(--geen-data)",
  1: "var(--niveau-1)",
  2: "var(--niveau-2)",
  3: "var(--niveau-3)",
  4: "var(--niveau-4)",
};

type NiveauPaar = { j1: number | null; j2: number | null };

interface DangerAntwoord {
  niveaus?: Record<string, NiveauPaar>;
  bijgewerkt?: string | null;
  opmerking?: string;
  fout?: string;
}

export default function Start({ embed }: { embed: boolean }) {
  const [statussen, setStatussen] = useState<ModuleStatus[] | null>(null);
  const [statusFout, setStatusFout] = useState(false);
  const [statusLaden, setStatusLaden] = useState(true);

  const [waarnemingen, setWaarnemingen] = useState<WaarnemingenAntwoord | null>(null);
  const [danger, setDanger] = useState<DangerAntwoord | null>(null);

  const [postcode, setPostcode] = useState("");

  // Lees een postcode uit de eigen URL, zodat een gedeelde of bewaarde link met
  // ?postcode= direct goed opent.
  useEffect(() => {
    const pc = new URLSearchParams(window.location.search).get("postcode");
    if (pc) setPostcode(pc);
  }, []);

  useEffect(() => {
    if (embed) document.documentElement.classList.add("embed");
  }, [embed]);

  // Status voor de merk-badges en de eerlijke tekst buiten het seizoen.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/status");
        const json: { modules?: ModuleStatus[] } = await res.json();
        if (!actief) return;
        if (Array.isArray(json.modules)) setStatussen(json.modules);
        else setStatusFout(true);
      } catch {
        if (actief) setStatusFout(true);
      } finally {
        if (actief) setStatusLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Hittebronnen: het exacte aantal detecties en het zwaarst getroffen
  // departement komen uit de bestaande waarnemingenroute.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/waarnemingen");
        const json: WaarnemingenAntwoord = await res.json();
        if (actief) setWaarnemingen(json);
      } catch {
        if (actief)
          setWaarnemingen({
            beschikbaar: false,
            waarnemingen: [],
            bijgewerkt: null,
            bron: "NASA FIRMS — VIIRS",
            periodeUren: 24,
          });
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  // Brandgevaar: de niveaus per departement (morgen/overmorgen) komen uit de
  // bestaande dangerroute. Buiten het seizoen geeft die geen niveaus terug; dan
  // valt het blok terug op de eerlijke statustekst.
  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/danger");
        const json: DangerAntwoord = await res.json();
        if (actief) setDanger(json);
      } catch {
        if (actief) setDanger({ niveaus: {} });
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const postcodeResultaat = useMemo(
    () => (postcode.trim() ? departementVoorPostcode(postcode.trim()) : null),
    [postcode]
  );
  const gevondenDep =
    postcodeResultaat?.type === "ok"
      ? postcodeResultaat.departementen.map((d) => `${d.naam} (${d.code})`).join(" / ")
      : null;
  const gekozenCodes =
    postcodeResultaat?.type === "ok"
      ? postcodeResultaat.departementen.map((d) => d.code)
      : null;
  const gekozenNaam =
    postcodeResultaat?.type === "ok"
      ? postcodeResultaat.departementen.map((d) => d.naam).join(" / ")
      : null;

  // "In en rond uw departement": de departementen waarvan het middelpunt binnen
  // 75 km van dat van de gekozen departement(en) ligt. Zo telt ook een brand net
  // over de departementsgrens mee — voor een grensbewoner is dat wat er "bij mij"
  // geldt. Zonder postcode blijft het nationaal.
  const OMGEVING_KM = 75;
  const omgevingsCodes = useMemo(() => {
    if (!gekozenCodes) return null;
    const set = new Set<string>();
    for (const code of gekozenCodes) {
      for (const buur of departementenBinnenStraal(code, OMGEVING_KM)) set.add(buur);
    }
    return [...set];
  }, [gekozenCodes]);

  const statusVoor = (id: string): ModuleStatus | null =>
    statussen?.find((s) => s.id === id) ?? null;

  function bouwLink(pad: string): string {
    const [basis, query] = pad.split("?");
    const params = new URLSearchParams(query);
    if (postcode.trim()) params.set("postcode", postcode.trim());
    if (embed) params.set("embed", "1");
    const qs = params.toString();
    return qs ? `${basis}?${qs}` : basis;
  }

  // ---- Hittebronnen: aantal + zwaarste departement ----
  const hittebronnenBeschikbaar = waarnemingen?.beschikbaar === true;
  const aantalDetecties = waarnemingen?.waarnemingen.length ?? 0;
  const zwaarsteCode = hittebronnenBeschikbaar
    ? meestVoorkomend(waarnemingen!.waarnemingen.map((w) => w.departementCode))
    : null;
  const zwaarsteNaam = zwaarsteCode
    ? DEP_BY_CODE[zwaarsteCode]?.naam ?? `departement ${zwaarsteCode}`
    : null;
  const hittebronnenErnst =
    aantalDetecties > 200 ? 4 : aantalDetecties > 50 ? 3 : aantalDetecties > 10 ? 2 : aantalDetecties > 0 ? 1 : 0;

  // ---- Brandgevaar: niveaus morgen/overmorgen (per postcode of nationaal) ----
  const dangerNiveaus = danger?.niveaus ?? null;
  const dangerBeschikbaar = !!dangerNiveaus && Object.keys(dangerNiveaus).length > 0;
  const brandgevaar = useMemo(
    () => hoogsteNiveaus(dangerNiveaus, omgevingsCodes),
    [dangerNiveaus, omgevingsCodes]
  );
  // Nationaal zwaarste voor de optionele kopregel onder de h1.
  const nationaalZwaarste = useMemo(() => zwaarsteDepMorgen(dangerNiveaus), [dangerNiveaus]);

  // ---- FR-Alert ----
  const frAlertStatus = statusVoor("waarschuwingen");

  const laden = statusLaden || !waarnemingen || !danger;

  return (
    <div className="omhulsel">
      <EmbedHoogte actief={embed} />

      {!embed && (
        <header className="site-kop">
          <h1>Weer en waarschuwingen Frankrijk</h1>
          <p>Twee vragen: is er nú iets gemeten, en wordt het morgen gevaarlijk?</p>
        </header>
      )}

      {/* Optionele kopregel bij een verhoogd nationaal gevaarniveau (ernst ≥ 3).
          Noemt expliciet onderwerp (brandgevaar) én bron (Météo-France), zodat
          hij niet te verwarren is met de gemeten hittebronnen verderop. */}
      {nationaalZwaarste && nationaalZwaarste.niveau >= 3 && (
        <p className={styles.zwaarsteRegel}>
          Hoogste brandgevaar nu: niveau {nationaalZwaarste.niveau} in {nationaalZwaarste.naam}{" "}
          (Météo-France).
        </p>
      )}

      <section className={`sectie ${styles.postcodeSectie}`} aria-labelledby="start-postcode-titel">
        <h2 id="start-postcode-titel" style={{ marginBottom: 6 }}>
          Uw postcode (optioneel)
        </h2>
        <Postcode
          waarde={postcode}
          onWaarde={setPostcode}
          modus="direct"
          placeholder="bijv. 33000"
        />
        {gevondenDep && (
          <p className={styles.gevondenDep}>
            Departement: <strong>{gevondenDep}</strong> — dit gaat mee als u een kaart opent.
          </p>
        )}
        {postcodeResultaat?.type === "ongeldig" && postcode.trim().length === 5 && (
          <p className={styles.postcodeFout}>Dat is geen geldige Franse postcode (5 cijfers).</p>
        )}
        {postcodeResultaat?.type === "buiten-metropole" && (
          <p className={styles.postcodeFout}>
            Deze tools dekken alleen Frankrijk métropole (incl. Corsica).
          </p>
        )}
      </section>

      {laden && <Voortgang fasen={LAAD_FASEN} />}

      {statusFout && (
        <p className={styles.statusFoutMelding}>
          De actuele status is nu niet beschikbaar. De onderdelen hieronder werken gewoon; alleen
          de samenvatting per blok ontbreekt tijdelijk.
        </p>
      )}

      <div className={styles.blokken}>
        {/* ---- Nu — gemeten: Hittebronnen ---- */}
        <Groep groep="nu">
          <article
            className={styles.blok}
            style={{ borderLeftColor: ERNST_ACCENT[hittebronnenErnst] }}
          >
            <Blokkop titel="Hittebronnen" merk={statusVoor("hittebronnen")?.merk ?? null} />
            <Herkomst id="hittebronnen" />
            {statusLaden || !waarnemingen ? (
              <p className={styles.blokStatus} aria-live="polite">
                Status laden…
              </p>
            ) : hittebronnenBeschikbaar ? (
              <>
                <p className={styles.kerncijfer}>
                  {aantalDetecties} {aantalDetecties === 1 ? "detectie" : "detecties"}
                </p>
                {/* Dataregel in de niveaukleur van het gemelde niveau (gelijk
                    aan het linker-randaccent van het blok). */}
                {zwaarsteNaam && (
                  <p
                    className={styles.hittebronDataregel}
                    style={{ color: NIVEAUS[hittebronnenErnst]?.kleur ?? GEEN_DATA_KLEUR }}
                  >
                    Meeste warmte gemeten in: {zwaarsteNaam}
                  </p>
                )}
                {/* Voorbehoud als eigen regel, zachter en kleiner: blijft direct
                    zichtbaar, maar wordt niet meer als deel van de meting gelezen. */}
                <p className={styles.voorbehoud}>
                  Een detectie is een waarneming van warmte, geen bevestigde brand.
                </p>
              </>
            ) : (
              <p className={styles.blokUitleg}>
                {waarnemingen.opmerking ?? "Satellietwaarnemingen zijn nu niet beschikbaar."}
              </p>
            )}
            <div className={styles.acties}>
              <a className={styles.actiePrimair} href={bouwLink("/?laag=alle")}>
                Op de kaart →
              </a>
              {/* Rookpaden is een vervolgactie, geen bestemming: verberg de knop
                  bij nul detecties — een ingang naar een lege kaart is erger dan
                  geen ingang. */}
              {aantalDetecties > 0 && (
                <a className={styles.actieSecundair} href={bouwLink(ROOK_ACTIE.pad)}>
                  {ROOK_ACTIE.label}
                </a>
              )}
            </div>
          </article>
        </Groep>

        {/* ---- Straks — verwacht: Brandgevaar ---- */}
        <Groep groep="straks">
          <article
            className={styles.blok}
            style={{
              borderLeftColor:
                brandgevaar.j1 != null ? NIVEAUS[brandgevaar.j1]?.kleur ?? GEEN_DATA_KLEUR : GEEN_DATA_KLEUR,
            }}
          >
            <Blokkop titel="Brandgevaar" merk={statusVoor("brandgevaar")?.merk ?? null} />
            <Herkomst id="brandgevaar" />
            {!danger ? (
              <p className={styles.blokStatus} aria-live="polite">
                Status laden…
              </p>
            ) : dangerBeschikbaar ? (
              <>
                <div className={styles.niveauRij}>
                  <NiveauBlokje label="Morgen" waarde={brandgevaar.j1} />
                  <NiveauBlokje label="Overmorgen" waarde={brandgevaar.j2} />
                </div>
                <p className={styles.blokUitleg}>
                  Dit gaat over de kans dat er iets ontstaat — er brandt nu niets.
                  {gekozenNaam ? ` Geldt in en rond uw departement ${gekozenNaam}.` : ""}
                </p>
              </>
            ) : (
              <p className={styles.blokUitleg}>
                {danger.opmerking ??
                  statusVoor("brandgevaar")?.samenvatting ??
                  "Het gevaarniveau is nu niet beschikbaar. De Météo des forêts-kaart verschijnt alleen tijdens het seizoen (1 juni t/m 30 september)."}
              </p>
            )}
            <div className={styles.acties}>
              <a className={styles.actiePrimair} href={bouwLink("/?laag=gevaar")}>
                Op de kaart →
              </a>
            </div>
          </article>
        </Groep>

        {/* ---- Officieel: FR-Alert ---- */}
        <Groep groep="officieel">
          <article
            className={styles.blok}
            style={{ borderLeftColor: ERNST_ACCENT[frAlertStatus?.ernst ?? 0] }}
          >
            <Blokkop titel="FR-Alert" merk={frAlertStatus?.merk ?? null} />
            <Herkomst id="waarschuwingen" />
            <p className={styles.blokUitleg}>
              {statusLaden
                ? "Status laden…"
                : frAlertStatus?.beschikbaar
                  ? `${frAlertStatus.samenvatting} Een lege lijst betekent niet dat er niets aan de hand is.`
                  : frAlertStatus?.samenvatting ??
                    "Officiële meldingen zijn nu niet beschikbaar."}
            </p>
            <div className={styles.acties}>
              <a className={styles.actieSecundair} href={bouwLink("/?laag=officieel")}>
                Meldingen op de kaart →
              </a>
            </div>
          </article>
        </Groep>

        {/* ---- Voetregel "Gedupeerd?" — vervangt de vroegere vijfde tegel ---- */}
        <div className={styles.voetregel}>
          Schade geleden door brand, storm of natuurramp?{" "}
          <a
            className={styles.voetregelLink}
            href={GEDUPEERD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Zo regelt u uw verzekering →
          </a>
        </div>
      </div>

      <footer className="site-voet">
        <p style={{ margin: 0 }}>
          Officiële informatie bij gevaar: bel 18 of 112 (doven en slechthorenden: 114). Volg
          altijd FR-Alert en de instructies van prefectuur en mairie.
        </p>
        {!embed && (
          <p style={{ margin: "8px 0 0" }}>
            <a href="https://www.nederlanders.fr/page/bosbranden">
              Deze tool staat ook op nederlanders.fr
            </a>
          </p>
        )}
      </footer>
    </div>
  );
}

// ---- Kleine bouwstenen ----

function Groep({ groep, children }: { groep: Tijdgroep; children: React.ReactNode }) {
  return (
    <section className={styles.groep}>
      <h2 className={styles.groepKop}>{GROEP_KOPPEN[groep]}</h2>
      {children}
    </section>
  );
}

function Blokkop({ titel, merk }: { titel: string; merk: string | null }) {
  return (
    <div className={styles.blokKop}>
      <h3 className={styles.tegelTitel}>{titel}</h3>
      {merk && <span className={styles.ernstMerk}>{merk}</span>}
    </div>
  );
}

function Herkomst({ id }: { id: string }) {
  const module = MODULES.find((m) => m.id === id);
  if (!module) return null;
  return <p className={styles.herkomst}>{module.herkomst}</p>;
}

// Klein gekleurd niveaublok (Morgen/Overmorgen) in de officiële
// Météo-France-kleuren. Bewust compacter dan de globale .niveau-blok.
function NiveauBlokje({ label, waarde }: { label: string; waarde: number | null }) {
  const niveau = waarde != null ? NIVEAUS[waarde] : null;
  return (
    <div
      className={styles.niveauBlok}
      style={{
        background: niveau?.kleur ?? GEEN_DATA_KLEUR,
        color: niveau?.tekstKleur ?? "#4a4a4a",
      }}
    >
      <span className={styles.niveauBlokDag}>{label}</span>
      <span className={styles.niveauBlokWaarde}>
        {niveau ? `${niveau.nl} (${niveau.waarde})` : "geen gegevens"}
      </span>
    </div>
  );
}

// ---- Hulpfuncties ----

function meestVoorkomend(waarden: string[]): string | null {
  const telling = new Map<string, number>();
  for (const w of waarden) telling.set(w, (telling.get(w) ?? 0) + 1);
  let beste: string | null = null;
  let max = 0;
  for (const [w, n] of telling) {
    if (n > max) {
      max = n;
      beste = w;
    }
  }
  return beste;
}

// Hoogste j1/j2 over een set departementcodes, of over heel Frankrijk als er
// geen codes zijn opgegeven. null wanneer er geen enkele waarde bekend is.
function hoogsteNiveaus(
  niveaus: Record<string, NiveauPaar> | null,
  codes: string[] | null
): NiveauPaar {
  if (!niveaus) return { j1: null, j2: null };
  const entries = codes
    ? codes.map((c) => niveaus[c]).filter((v): v is NiveauPaar => !!v)
    : Object.values(niveaus);
  const max = (kies: (p: NiveauPaar) => number | null): number | null => {
    let hoogste: number | null = null;
    for (const p of entries) {
      const v = kies(p);
      if (v != null && (hoogste == null || v > hoogste)) hoogste = v;
    }
    return hoogste;
  };
  return { j1: max((p) => p.j1), j2: max((p) => p.j2) };
}

// Het departement met het hoogste niveau voor morgen (j1), met naam.
function zwaarsteDepMorgen(
  niveaus: Record<string, NiveauPaar> | null
): { naam: string; niveau: number } | null {
  if (!niveaus) return null;
  let besteCode: string | null = null;
  let hoogste = 0;
  for (const [code, paar] of Object.entries(niveaus)) {
    const j1 = paar.j1 ?? 0;
    if (j1 > hoogste) {
      hoogste = j1;
      besteCode = code;
    }
  }
  if (!besteCode || hoogste === 0) return null;
  return { naam: DEP_BY_CODE[besteCode]?.naam ?? `departement ${besteCode}`, niveau: hoogste };
}
