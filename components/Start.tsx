"use client";

// Tegelstart (/start) — puur additief startscherm. Eén postcodeveld boven de
// tegels; elke tegel toont titel, functie, live status en een ernst-accent.
// Raakt de bestaande pagina's niet aan; linkt er alleen naartoe.

import { useEffect, useMemo, useState } from "react";
import { ACTIEVE_MODULES } from "@/lib/modules";
import { departementVoorPostcode } from "@/lib/departements";
import type { ModuleStatus } from "@/app/api/status/route";
import EmbedHoogte from "@/components/EmbedHoogte";
import Voortgang from "@/components/Voortgang";
import styles from "@/components/Start.module.css";

const LAAD_FASEN = [
  "Actuele status ophalen…",
  "Brandgevaar, hittebronnen, rook en meldingen samenvatten…",
  "Tegels klaarzetten…",
];

export default function Start({ embed }: { embed: boolean }) {
  const [statussen, setStatussen] = useState<ModuleStatus[] | null>(null);
  const [statusFout, setStatusFout] = useState(false);
  const [laden, setLaden] = useState(true);
  const [postcode, setPostcode] = useState("");

  // Lees een postcode uit de eigen URL, zodat een gedeelde of bewaarde link met
  // ?postcode= direct goed opent.
  useEffect(() => {
    const pc = new URLSearchParams(window.location.search).get("postcode");
    if (pc) setPostcode(pc);
  }, []);

  useEffect(() => {
    if (embed) document.documentElement.classList.add("embed");
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
        if (actief) setLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [embed]);

  const postcodeResultaat = useMemo(
    () => (postcode.trim() ? departementVoorPostcode(postcode.trim()) : null),
    [postcode]
  );
  const gevondenDep =
    postcodeResultaat?.type === "ok"
      ? postcodeResultaat.departementen.map((d) => `${d.naam} (${d.code})`).join(" / ")
      : null;

  const statusVoor = (id: string): ModuleStatus | null =>
    statussen?.find((s) => s.id === id) ?? null;

  // Tegels sorteren op ernst, aflopend; zonder status blijft de registervolgorde.
  const tegels = useMemo(() => {
    const lijst = ACTIEVE_MODULES.map((module) => ({
      module,
      status: statusVoor(module.id),
    }));
    if (statussen) {
      lijst.sort((a, b) => (b.status?.ernst ?? 0) - (a.status?.ernst ?? 0));
    }
    return lijst;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statussen]);

  function bouwLink(pad: string): string {
    const [basis, query] = pad.split("?");
    const params = new URLSearchParams(query);
    if (postcode.trim()) params.set("postcode", postcode.trim());
    if (embed) params.set("embed", "1");
    const qs = params.toString();
    return qs ? `${basis}?${qs}` : basis;
  }

  return (
    <div className="omhulsel">
      <EmbedHoogte actief={embed} />

      {!embed && (
        <header className="site-kop">
          <h1>Weer en waarschuwingen Frankrijk</h1>
          <p>Kies waar u naar wilt kijken. Vul eventueel uw postcode in; die nemen we mee.</p>
        </header>
      )}

      <section className={`sectie ${styles.postcodeSectie}`} aria-labelledby="start-postcode-titel">
        <h2 id="start-postcode-titel" style={{ marginBottom: 6 }}>
          Uw postcode (optioneel)
        </h2>
        <form className="postcode-vorm" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="start-postcode" style={{ position: "absolute", left: "-9999px" }}>
            Franse postcode
          </label>
          <input
            id="start-postcode"
            inputMode="numeric"
            pattern="[0-9]{5}"
            autoComplete="postal-code"
            placeholder="bijv. 33000"
            maxLength={5}
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
          />
        </form>
        {gevondenDep && (
          <p className={styles.gevondenDep}>
            Departement: <strong>{gevondenDep}</strong> — dit gaat mee als u een tegel opent.
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
          de samenvatting per tegel ontbreekt tijdelijk.
        </p>
      )}

      <div className={styles.hub}>
        <div className={styles.tegels}>
          {tegels.map(({ module, status }) => {
            const ernst = status?.ernst ?? 0;
            return (
              <a
                key={module.id}
                className={`${styles.tegel} ${styles[`ernst${ernst}`]}`}
                href={bouwLink(module.pad)}
                aria-label={`${module.titel}. ${module.functie}${
                  status?.beschikbaar ? ` ${status.samenvatting}` : ""
                }`}
              >
                <div className={styles.tegelKop}>
                  <h2 className={styles.tegelTitel}>{module.titel}</h2>
                  {(() => {
                    // De module levert desgewenst een eigen, feitelijk merk (bijv. een
                    // teller). Alleen bij een echt gevaarniveau valt het terug op
                    // "nu verhoogd" — geen alarmtoon op een simpele teller.
                    const merk = status?.merk ?? (ernst >= 3 ? "nu verhoogd" : null);
                    return merk ? <span className={styles.ernstMerk}>{merk}</span> : null;
                  })()}
                </div>
                <p className={styles.tegelFunctie}>{module.functie}</p>
                <p className={styles.tegelStatus} aria-live="polite">
                  {!statussen && !statusFout
                    ? "Status laden…"
                    : status?.beschikbaar
                      ? status.samenvatting
                      : status
                        ? status.samenvatting
                        : "Statussamenvatting nu niet beschikbaar."}
                </p>
                <span className={styles.tegelGa} aria-hidden="true">
                  Openen →
                </span>
              </a>
            );
          })}
        </div>
      </div>

      <footer className="site-voet">
        <p style={{ margin: 0 }}>
          Officiële informatie bij gevaar: bel 18 of 112 (doven en slechthorenden: 114). Volg
          altijd FR-Alert en de instructies van prefectuur en mairie.
        </p>
      </footer>
    </div>
  );
}
