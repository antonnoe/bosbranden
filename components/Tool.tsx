"use client";

// Hoofdcomponent: postcode-check + klikbare kaart, met verplichte
// bronvermelding, updatedatum en disclaimers voor Météo-France en NASA FIRMS.

import { useEffect, useMemo, useState } from "react";
import { departementVoorPostcode, type Departement } from "@/lib/departements";
import { NIVEAUS, niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import type { WaarnemingenAntwoord } from "@/lib/waarnemingen";
import Voortgang from "@/components/Voortgang";
import NiveauBlok from "@/components/NiveauBlok";
import InfoKnop from "@/components/InfoKnop";
import { UITLEG } from "@/data/uitleg";
import FranceKaart from "@/components/FranceKaart";
import EmbedHoogte from "@/components/EmbedHoogte";
import styles from "@/components/Waarnemingen.module.css";

export type Niveaus = Record<string, { j1: number | null; j2: number | null }>;

// Kaartlaag-sleutel (gedeeld met FranceKaart's Weergave). Deep-linkwaarden uit de
// /start-tegels koppelen expliciet aan een laag + of de satellietwaarnemingen aan
// staan — zodat de Brandgevaar-tegel op de gevaarniveaus landt, niet op een
// satellietlaag, en een onbekende waarde op de standaard terugvalt.
export type KaartWeergave = "alle" | "geclusterd" | "officieel";

const KAART_INTENTIES: Record<string, { weergave: KaartWeergave; satelliet: boolean }> = {
  gevaar: { weergave: "alle", satelliet: false }, // Brandgevaar: alleen de departementkleuren
  hittebronnen: { weergave: "alle", satelliet: true },
  alle: { weergave: "alle", satelliet: true },
  geclusterd: { weergave: "geclusterd", satelliet: true },
  officieel: { weergave: "officieel", satelliet: true },
};

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
  if (Number.isNaN(d.getTime())) return iso;
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

  const [waarnemingenData, setWaarnemingenData] = useState<WaarnemingenAntwoord | null>(null);
  const [waarnemingenLaden, setWaarnemingenLaden] = useState(true);
  const [toonWaarnemingen, setToonWaarnemingen] = useState(true);
  const [gekozenWaarnemingId, setGekozenWaarnemingId] = useState<string | null>(null);

  const [postcode, setPostcode] = useState("");
  const [gezocht, setGezocht] = useState<string | null>(null);
  const [invoerMelding, setInvoerMelding] = useState<string | null>(null);

  const [echeance, setEcheance] = useState<"j1" | "j2">("j1");
  const [gekozenDep, setGekozenDep] = useState<string | null>(null);
  const [beginWeergave, setBeginWeergave] = useState<KaartWeergave | undefined>(undefined);

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

  useEffect(() => {
    let actief = true;

    (async () => {
      try {
        const res = await fetch("/api/waarnemingen");
        const json: WaarnemingenAntwoord = await res.json();
        if (actief) setWaarnemingenData(json);
      } catch {
        if (actief) {
          setWaarnemingenData({
            beschikbaar: false,
            waarnemingen: [],
            bijgewerkt: null,
            bron: "NASA FIRMS — VIIRS",
            periodeUren: 24,
            opmerking: "Actuele satellietwaarnemingen zijn tijdelijk niet beschikbaar.",
          });
        }
      } finally {
        if (actief) setWaarnemingenLaden(false);
      }
    })();

    return () => {
      actief = false;
    };
  }, []);

  // Deep-link ?laag=: expliciete koppeling op laagsleutel (geen DOM-geklik meer).
  // Een onbekende waarde valt terug op de standaardlaag i.p.v. op niets.
  useEffect(() => {
    const laag = new URLSearchParams(window.location.search).get("laag");
    if (!laag) return;
    const intentie = KAART_INTENTIES[laag];
    if (!intentie) return; // onbekend → standaard (geen wijziging)
    setBeginWeergave(intentie.weergave);
    setToonWaarnemingen(intentie.satelliet);
  }, []);

  // Additief: leest ?postcode= bij het opstarten, vult het veld voor en toont
  // het resultaat alsof de bezoeker had gezocht. Zonder parameter: niets.
  useEffect(() => {
    const pc = new URLSearchParams(window.location.search).get("postcode");
    if (pc && pc.trim()) {
      setPostcode(pc.trim());
      setGezocht(pc.trim());
    }
  }, []);

  const zoekresultaat = useMemo(
    () => (gezocht === null ? null : departementVoorPostcode(gezocht)),
    [gezocht]
  );

  const startHref = (() => {
    const params = new URLSearchParams();
    if (embed) params.set("embed", "1");
    if (postcode.trim()) params.set("postcode", postcode.trim());
    const qs = params.toString();
    return qs ? `/start?${qs}` : "/start";
  })();

  const niveaus = data?.niveaus ?? {};
  const waarnemingen = waarnemingenData?.waarnemingen ?? [];

  return (
    <div className="omhulsel">
      <EmbedHoogte actief={embed} />
      <a className="terug-overzicht" href={startHref}>
        ← Terug naar overzicht
      </a>
      {!embed && (
        <header className="site-kop">
          <h1>Brandrisico Frankrijk</h1>
          <p>
            Het verwachte bosbrandgevaar per departement, met een rustige laag van recente
            satellietwaarnemingen van hittebronnen.
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
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            // Valideer vóór het opzoeken: precies vijf cijfers, geen stille afwijzing.
            const cijfers = postcode.replace(/\D/g, "");
            if (cijfers.length !== 5) {
              setInvoerMelding("Een Franse postcode heeft vijf cijfers.");
              setGezocht(null);
              return;
            }
            setInvoerMelding(null);
            setGezocht(cijfers);
          }}
        >
          <label htmlFor="postcode" style={{ position: "absolute", left: "-9999px" }}>
            Franse postcode
          </label>
          <input
            id="postcode"
            name="postcode"
            inputMode="numeric"
            pattern="[0-9]{5}"
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

        {invoerMelding && (
          <p className="fout-melding" role="alert">
            {invoerMelding}
          </p>
        )}
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
                laden={laden}
                laadFout={laadFout}
              />
            ))}
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
          Klik op een departement voor het risico. Klik op een pin voor de gemeten
          satellietgegevens.
        </p>

        <div className={styles.bediening}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              aria-describedby="waarnemingen-toelichting"
              checked={
                toonWaarnemingen &&
                !!waarnemingenData?.beschikbaar &&
                waarnemingen.length > 0
              }
              disabled={!waarnemingenData?.beschikbaar || waarnemingen.length === 0}
              onChange={(e) => {
                setToonWaarnemingen(e.target.checked);
                if (!e.target.checked) setGekozenWaarnemingId(null);
              }}
            />
            Satellietwaarnemingen tonen
          </label>
          <p id="waarnemingen-toelichting" className={styles.checkboxToelichting}>
            Nodig voor ‘Alle hittebronnen’ en ‘Geclusterde hittebronnen’. ‘Officieel
            gemeld’ werkt zonder dit vinkje.
          </p>
          <p className={styles.status} aria-live="polite">
            {waarnemingenLaden
              ? "Waarnemingen laden…"
              : waarnemingenData?.beschikbaar
                ? waarnemingen.length === 0
                  ? "Geen VIIRS-detecties boven Frankrijk in de afgelopen 24 uur."
                  : `${waarnemingen.length} VIIRS-detecties in de afgelopen 24 uur.`
                : waarnemingenData?.opmerking ?? "Waarnemingen niet beschikbaar."}
          </p>
        </div>

        <FranceKaart
          niveaus={niveaus}
          echeance={echeance}
          gekozen={gekozenDep}
          onKies={(code) => {
            setGekozenWaarnemingId(null);
            setGekozenDep((huidig) => (huidig === code ? null : code));
          }}
          waarnemingen={waarnemingen}
          toonWaarnemingen={toonWaarnemingen && !!waarnemingenData?.beschikbaar}
          gekozenWaarneming={gekozenWaarnemingId}
          onKiesWaarneming={(id) => {
            setGekozenDep(null);
            setGekozenWaarnemingId((huidig) => (huidig === id ? null : id));
          }}
          beginWeergave={beginWeergave}
          onVraagWaarnemingen={() => setToonWaarnemingen(true)}
        />

        {/* Onderscheid tussen de twee kaartlagen expliciet maken: de
            departementkleur is een verwachting, de bolletjes en pins zijn
            gemeten warmte en meldingen van de afgelopen 24 uur. */}
        <div className="kaart-laaguitleg">
          <p className="laag-onderscheid">
            De <strong>kleur</strong> van elk departement toont het verwachte brandgevaar
            <InfoKnop
              kop={UITLEG.verwachtBrandgevaar.kop}
              tekst={UITLEG.verwachtBrandgevaar.tekst}
            />{" "}
            — een voorspelling van Météo-France. De <strong>bolletjes en pins</strong> tonen
            gemeten warmte en officiële meldingen van de afgelopen 24 uur. Dat zijn twee losse
            gegevensbronnen die los van elkaar gelezen moeten worden.
          </p>
          <p className="laag-onderscheid">
            De cijfers in de bolletjes zijn het aantal satellietmetingen in dat gebied — niet
            het aantal branden.
          </p>
        </div>

        <div className="legenda" aria-hidden="true">
          {[1, 2, 3, 4].map((w) => (
            <span key={w}>
              <i style={{ background: NIVEAUS[w].kleur }} /> {NIVEAUS[w].nl}
            </span>
          ))}
          <span>
            <i style={{ background: GEEN_DATA_KLEUR }} /> geen gegevens
          </span>
          {waarnemingenData?.beschikbaar && waarnemingen.length > 0 && (
            <>
              <span>
                <i
                  style={{
                    background: "#800000",
                    borderRadius: "50% 50% 50% 0",
                    transform: "rotate(45deg)",
                  }}
                />{" "}
                losse satellietmeting
              </span>
              <span>
                <i style={{ background: "#800000", borderRadius: "50%" }} /> bolletje met aantal
                metingen
              </span>
            </>
          )}
          <span>
            <i
              style={{
                background: "#b00020",
                borderRadius: "50% 50% 50% 0",
                transform: "rotate(45deg)",
              }}
            />{" "}
            officiële FR-Alert-melding
          </span>
        </div>

        {/* De uitkomst van zowel een pin- als een departementklik verschijnt nu
            als kaartpopup binnen FranceKaart, niet meer onder de kaart. */}

        <Bronvermelding bijgewerkt={data?.bijgewerkt ?? null} />
        <Disclaimer />
      </section>

      {/* ---------- C. Verwijzing naar de rookmodule ---------- */}
      <section className="sectie" aria-labelledby="rook-verwijzing-titel">
        <h2 id="rook-verwijzing-titel" style={{ marginBottom: 6 }}>
          Waar waait de rook naartoe?
        </h2>
        <p style={{ marginTop: 0 }}>
          Bekijk de berekende windbaan vanaf gedetecteerde hittebronnen — op leefniveau en op
          hoogte, met een postcode-check of die windbaan naar u toe komt.
        </p>
        <a className="knop" href={embed ? "/rook?embed=1" : "/rook"} style={{ display: "inline-block", textDecoration: "none" }}>
          Naar de rookmodule
        </a>
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
            </a>{" "}
            ·{" "}
            <a
              href="https://firms.modaps.eosdis.nasa.gov/"
              target="_blank"
              rel="noopener noreferrer"
            >
              NASA FIRMS
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
  laden,
  laadFout,
}: {
  dep: Departement;
  niveaus: Niveaus;
  heeftData: boolean;
  laden: boolean;
  laadFout: string | null;
}) {
  const j1 = niveaus[dep.code]?.j1 ?? null;
  const j2 = niveaus[dep.code]?.j2 ?? null;
  return (
    <div className="resultaat">
      <div className="resultaat-kop">
        <h3 style={{ margin: 0 }}>{dep.naam}</h3>
        <span className="dep-code">departement {dep.code}</span>
      </div>
      {/* Zichtbare terugkoppeling: laden, mislukt of geen gegevens — nooit stilte. */}
      {laden && (
        <p className="niveau-toelichting" aria-live="polite">
          Het gevaarniveau wordt opgehaald…
        </p>
      )}
      {!laden && laadFout && (
        <p className="fout-melding" role="alert">
          Het gevaarniveau kon niet worden opgehaald. Probeer het later opnieuw.
        </p>
      )}
      {!laden && !laadFout && !heeftData && (
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
