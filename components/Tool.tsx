"use client";

// Hoofdcomponent: postcode-check + klikbare kaart, met verplichte
// bronvermelding, updatedatum en disclaimer (licentie-eisen Météo-France).

import { useEffect, useMemo, useState } from "react";
import { DEP_BY_CODE, departementVoorPostcode, type Departement } from "@/lib/departements";
import { NIVEAUS, niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import Voortgang from "@/components/Voortgang";
import NiveauBlok from "@/components/NiveauBlok";
import FranceKaart from "@/components/FranceKaart";

export type Niveaus = Record<string, { j1: number | null; j2: number | null }>;

interface DangerAntwoord {
  niveaus: Niveaus;
  bijgewerkt: string | null;
  datumJ1: string | null;
  datumJ2: string | null;
  fout?: string;
  opmerking?: string;
}

const DISCLAIMER =
  "De Météo des forêts toont het verwachte gevaarniveau, geen actuele branden. " +
  "Zie je rook of vuur: bel 18 of 112 (doven/slechthorenden: 114). Volg bij een " +
  "brand altijd FR-Alert en de instructies van prefectuur en mairie.";

function Bronvermelding({ bijgewerkt }: { bijgewerkt: string | null }) {
  return (
    <p className="bron-regel">
      Bron:{" "}
      <a href="https://meteofrance.com/meteo-des-forets" target="_blank" rel="noopener noreferrer">
        Météo-France — Météo des forêts
      </a>
      {bijgewerkt ? <> · laatste update van de data: {formatteerDatum(bijgewerkt)}</> : null}
    </p>
  );
}

function Disclaimer() {
  return <p className="disclaimer">{DISCLAIMER}</p>;
}

function formatteerDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // onbekend formaat: toon zoals de bron het geeft
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

export default function Tool({ embed }: { embed: boolean }) {
  const [data, setData] = useState<DangerAntwoord | null>(null);
  const [laden, setLaden] = useState(true);
  const [laadFout, setLaadFout] = useState<string | null>(null);

  const [postcode, setPostcode] = useState("");
  const [gezocht, setGezocht] = useState<string | null>(null);

  const [echeance, setEcheance] = useState<"j1" | "j2">("j1");
  const [gekozenDep, setGekozenDep] = useState<string | null>(null);

  useEffect(() => {
    if (embed) document.documentElement.classList.add("embed");
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/danger");
        const json: DangerAntwoord = await res.json();
        if (!actief) return;
        if (!res.ok || !json.niveaus) {
          setLaadFout(
            json.opmerking ??
              json.fout ??
              "De gegevens van Météo-France zijn op dit moment niet beschikbaar. Probeer het later opnieuw."
          );
        } else {
          setData(json);
        }
      } catch {
        if (actief)
          setLaadFout(
            "De gegevens van Météo-France zijn op dit moment niet beschikbaar. Probeer het later opnieuw."
          );
      } finally {
        if (actief) setLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [embed]);

  const zoekresultaat = useMemo(
    () => (gezocht === null ? null : departementVoorPostcode(gezocht)),
    [gezocht]
  );

  const niveaus = data?.niveaus ?? {};

  return (
    <div className="omhulsel">
      {!embed && (
        <header className="site-kop">
          <h1>Brandrisico Frankrijk</h1>
          <p>
            Het verwachte bosbrandgevaar per departement voor morgen en overmorgen,
            volgens de Météo des forêts van Météo-France.
          </p>
        </header>
      )}

      {laden && <Voortgang />}

      {!laden && laadFout && (
        <div className="sectie">
          <p className="fout-melding">{laadFout}</p>
          <Bronvermelding bijgewerkt={null} />
        </div>
      )}

      {/* ---------- A. Postcode-check ---------- */}
      <section className="sectie" aria-labelledby="postcode-titel">
        <h2 id="postcode-titel">Check op postcode</h2>
        <p style={{ marginTop: 0 }}>
          Vul een Franse postcode in (5 cijfers) en bekijk het gevaarniveau voor dat
          departement.
        </p>
        <form
          className="postcode-vorm"
          onSubmit={(e) => {
            e.preventDefault();
            setGezocht(postcode);
          }}
        >
          <label htmlFor="postcode" style={{ position: "absolute", left: "-9999px" }}>
            Franse postcode
          </label>
          <input
            id="postcode"
            name="postcode"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="bijv. 66000"
            maxLength={5}
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
          />
          <button className="knop" type="submit">
            Toon gevaarniveau
          </button>
        </form>

        {zoekresultaat?.type === "ongeldig" && (
          <p className="fout-melding" role="alert">
            Dat is geen geldige Franse postcode. Vul precies 5 cijfers in, bijvoorbeeld
            66000 of 20200.
          </p>
        )}
        {zoekresultaat?.type === "onbekend" && (
          <p className="fout-melding" role="alert">
            Deze postcode hoort niet bij een Frans departement. Controleer de invoer.
          </p>
        )}
        {zoekresultaat?.type === "buiten-metropole" && (
          <p className="fout-melding" role="alert">
            Deze tool dekt alleen Frankrijk métropole (incl. Corsica). Voor de
            overzeese gebieden publiceert Météo-France geen Météo des forêts.
          </p>
        )}

        {zoekresultaat?.type === "ok" && (
          <>
            {gezocht?.startsWith("20") && (
              <p style={{ marginBottom: 0 }}>
                Postcodes die met 20 beginnen liggen op Corsica; dat zijn twee
                departementen. Hieronder zie je ze allebei.
              </p>
            )}
            {zoekresultaat.departementen.map((dep) => (
              <PostcodeResultaatKaart
                key={dep.code}
                dep={dep}
                niveaus={niveaus}
                heeftData={!!data}
              />
            ))}
            <Bronvermelding bijgewerkt={data?.bijgewerkt ?? null} />
            <Disclaimer />
          </>
        )}
      </section>

      {/* ---------- B. Kaart ---------- */}
      <section className="sectie" aria-labelledby="kaart-titel">
        <div className="kaart-balk">
          <h2 id="kaart-titel" style={{ margin: 0 }}>
            Kaart van Frankrijk
          </h2>
          <div className="toggle" role="group" aria-label="Kies de dag">
            <button
              type="button"
              aria-pressed={echeance === "j1"}
              onClick={() => setEcheance("j1")}
            >
              Morgen (J+1)
            </button>
            <button
              type="button"
              aria-pressed={echeance === "j2"}
              onClick={() => setEcheance("j2")}
            >
              Overmorgen (J+2)
            </button>
          </div>
        </div>

        <p style={{ marginTop: 0 }}>
          Klik of tik op een departement voor de details.
        </p>

        <FranceKaart
          niveaus={niveaus}
          echeance={echeance}
          gekozen={gekozenDep}
          onKies={(code) => setGekozenDep((huidig) => (huidig === code ? null : code))}
        />

        <div className="legenda" aria-hidden="true">
          {[1, 2, 3, 4].map((w) => (
            <span key={w}>
              <i style={{ background: NIVEAUS[w].kleur }} /> {NIVEAUS[w].nl}
            </span>
          ))}
          <span>
            <i style={{ background: GEEN_DATA_KLEUR }} /> geen gegevens
          </span>
        </div>

        {gekozenDep && DEP_BY_CODE[gekozenDep] && (
          <div className="dep-paneel" aria-live="polite">
            <div className="paneel-kop">
              <h3>
                {DEP_BY_CODE[gekozenDep].naam}{" "}
                <span className="dep-code">{gekozenDep}</span>
              </h3>
              <button
                type="button"
                className="paneel-sluit"
                aria-label="Paneel sluiten"
                onClick={() => setGekozenDep(null)}
              >
                ×
              </button>
            </div>
            <div className="niveau-rij">
              <NiveauBlok dag="Morgen (J+1)" waarde={niveaus[gekozenDep]?.j1 ?? null} />
              <NiveauBlok dag="Overmorgen (J+2)" waarde={niveaus[gekozenDep]?.j2 ?? null} />
            </div>
            <ToelichtingVoor waarde={niveaus[gekozenDep]?.[echeance] ?? null} />
            <p style={{ margin: 0 }}>
              <a
                href={DEP_BY_CODE[gekozenDep].prefectuurUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Naar de prefectuur van {DEP_BY_CODE[gekozenDep].naam}
              </a>
            </p>
          </div>
        )}

        <Bronvermelding bijgewerkt={data?.bijgewerkt ?? null} />
        <Disclaimer />
      </section>

      <footer className="site-voet">
        {!embed && (
          <p style={{ margin: 0 }}>
            <a href="https://feux-foret.gouv.fr" target="_blank" rel="noopener noreferrer">
              Officiële preventie-informatie
            </a>{" "}
            ·{" "}
            <a
              href="https://meteofrance.com/meteo-des-forets"
              target="_blank"
              rel="noopener noreferrer"
            >
              Météo-France — Météo des forêts
            </a>
          </p>
        )}
        {embed && (
          <p style={{ margin: 0 }}>
            <a href="https://feux-foret.gouv.fr" target="_blank" rel="noopener noreferrer">
              Officiële preventie-informatie
            </a>
          </p>
        )}
      </footer>
    </div>
  );
}

function PostcodeResultaatKaart({
  dep,
  niveaus,
  heeftData,
}: {
  dep: Departement;
  niveaus: Niveaus;
  heeftData: boolean;
}) {
  const j1 = niveaus[dep.code]?.j1 ?? null;
  const j2 = niveaus[dep.code]?.j2 ?? null;
  return (
    <div className="resultaat">
      <div className="resultaat-kop">
        <h3 style={{ margin: 0 }}>{dep.naam}</h3>
        <span className="dep-code">departement {dep.code}</span>
      </div>
      {!heeftData && (
        <p className="fout-melding">
          Er zijn op dit moment geen niveaugegevens beschikbaar voor dit departement.
        </p>
      )}
      <div className="niveau-rij">
        <NiveauBlok dag="Morgen (J+1)" waarde={j1} />
        <NiveauBlok dag="Overmorgen (J+2)" waarde={j2} />
      </div>
      <ToelichtingVoor waarde={j1} />
      <p style={{ margin: 0 }}>
        <a href={dep.prefectuurUrl} target="_blank" rel="noopener noreferrer">
          Naar de prefectuur van {dep.naam}
        </a>{" "}
        (actuele lokale maatregelen en verboden)
      </p>
    </div>
  );
}

function ToelichtingVoor({ waarde }: { waarde: number | null }) {
  const niveau = niveauVoor(waarde);
  if (!niveau) return null;
  return <p className="niveau-toelichting">{niveau.toelichting}</p>;
}
