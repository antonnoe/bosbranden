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
import Postcode from "@/components/Postcode";
import EmbedHoogte from "@/components/EmbedHoogte";
import { normaliseerLaag, LAAG_LABELS, LAAG_UITLEG, type KaartLaag } from "@/lib/kaartlaag";
import styles from "@/components/Waarnemingen.module.css";

export type Niveaus = Record<string, { j1: number | null; j2: number | null }>;

// Kaartlaag-sleutel (gedeeld met FranceKaart's Weergave). Deep-linkwaarden uit de
// /start-tegels koppelen expliciet aan een laag + of de satellietwaarnemingen aan
// staan — zodat de Brandgevaar-tegel op de gevaarniveaus landt, niet op een
// satellietlaag, en een onbekende waarde op de standaard terugvalt.
export type KaartWeergave = "warmte" | "officieel";

// De vroegere lagen "alle" en "geclusterd" zijn samengevoegd tot één laag
// "warmte" (Warmtebronnen). Oude deep-linkwaarden blijven werken en landen op
// die ene laag, zodat bestaande gedeelde links niet breken.
const KAART_INTENTIES: Record<string, { weergave: KaartWeergave; satelliet: boolean }> = {
  gevaar: { weergave: "warmte", satelliet: false }, // Brandgevaar: alleen de departementkleuren
  hittebronnen: { weergave: "warmte", satelliet: true },
  warmte: { weergave: "warmte", satelliet: true },
  alle: { weergave: "warmte", satelliet: true },
  geclusterd: { weergave: "warmte", satelliet: true },
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
  const [gekozenWaarnemingId, setGekozenWaarnemingId] = useState<string | null>(null);

  const [postcode, setPostcode] = useState("");
  const [gezocht, setGezocht] = useState<string | null>(null);
  const [invoerMelding, setInvoerMelding] = useState<string | null>(null);

  const [echeance, setEcheance] = useState<"j1" | "j2">("j1");
  const [gekozenDep, setGekozenDep] = useState<string | null>(null);
  // De zichtbare laagkeuze bovenaan de kaart is de énige bron van waarheid voor
  // de kaartlaag; ze mapt op de bestaande kaartintenties (weergave + satelliet).
  // De satellietwaarnemingen volgen dus de laag — geen los vinkje dat de laag kan
  // tegenspreken (P3.3).
  const [laag, setLaag] = useState<KaartLaag>("alle");
  const toonWaarnemingen = KAART_INTENTIES[laag].satelliet;
  // Departementcode(s) waar de kaart naartoe zoomt na een geslaagde postcode-zoek
  // (C2). Verse array-referentie per zoekopdracht triggert FranceKaart opnieuw.
  const [zoomDeps, setZoomDeps] = useState<string[] | null>(null);

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
    const raw = new URLSearchParams(window.location.search).get("laag");
    if (!raw) return; // geen deeplink → standaardlaag "alle"
    const gekozen = normaliseerLaag(raw);
    setLaag(gekozen);
  }, []);

  // Laagkeuze bovenaan de kaart: zet de laag én werk ?laag= bij (shallow, geen
  // herladen) zodat de link deelbaar blijft. De satellietwaarnemingen volgen de
  // intentie van de laag.
  function kiesLaag(nieuw: KaartLaag) {
    if (nieuw === laag) return;
    setLaag(nieuw);
    setGekozenWaarnemingId(null); // een verborgen laag mag geen open meting-popup laten staan
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("laag", nieuw);
      window.history.replaceState(null, "", `?${params.toString()}`);
    } catch {
      /* history kan in een sandbox geblokkeerd zijn; de laag wisselt dan toch */
    }
  }

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

  // C2: bij een geslaagde postcode-zoek zoomt de kaart naar het bijbehorende
  // departement. Loopt ook bij het laden vanuit ?postcode=. De postcode zelf
  // wordt door het Postcode-veld in de URL geschreven (replaceState).
  useEffect(() => {
    if (zoekresultaat?.type !== "ok" || !gezocht) return;
    setZoomDeps(zoekresultaat.departementen.map((d) => d.code));
  }, [zoekresultaat, gezocht]);

  const niveaus = data?.niveaus ?? {};
  const waarnemingen = waarnemingenData?.waarnemingen ?? [];

  return (
    <div className="omhulsel">
      <EmbedHoogte actief={embed} />
      {/* In embed verdwijnt de kopregel (de NING-pagina heeft een eigen titel),
          maar de introtekst eronder blijft staan. Standalone verandert niet. */}
      <header className="site-kop">
        {!embed && <h1>Brandrisico Frankrijk</h1>}
        <p>
          Het verwachte bosbrandgevaar per departement, met een rustige laag van recente
          satellietwaarnemingen van hittebronnen.
        </p>
      </header>

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
        <Postcode
          waarde={postcode}
          onWaarde={setPostcode}
          knopLabel="Toon gevaarniveau"
          onZoek={(cijfers) => {
            setInvoerMelding(null);
            setGezocht(cijfers);
          }}
          onFout={(melding) => {
            setInvoerMelding(melding);
            setGezocht(null);
          }}
        />

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

        {/* Zichtbare laagkeuze bovenaan de kaart, met exact dezelfde woorden als
            op /start. Wisselen zet ?laag= (shallow) zodat de link deelbaar
            blijft; dit stuurt uitsluitend de SVG-kaart (niet /rook). */}
        <div className={styles.keuzebalkRij}>
          <span className={styles.keuzebalkLabel}>Kaartlaag:</span>
          <div className="toggle" role="group" aria-label="Kies de kaartlaag">
            {(["gevaar", "alle", "officieel"] as KaartLaag[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={laag === k}
                onClick={() => kiesLaag(k)}
              >
                {LAAG_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.laagUitleg}>{LAAG_UITLEG[laag]}</p>

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
          beginWeergave={KAART_INTENTIES[laag].weergave}
          zoomNaarDeps={zoomDeps}
        />

        {/* Onderscheid tussen de twee kaartlagen expliciet maken: de
            departementkleur is een verwachting, de bolletjes en pins zijn
            gemeten warmte en meldingen van de afgelopen 24 uur. */}
        <div className="kaart-laaguitleg">
          {/* Eén onderscheidsregel; de diepere uitleg staat achter de [i]-knop. */}
          <p className="laag-onderscheid">
            De <strong>kleur</strong> van elk departement is de verwachting van Météo-France
            <InfoKnop
              kop={UITLEG.verwachtBrandgevaar.kop}
              tekst={UITLEG.verwachtBrandgevaar.tekst}
            />; de <strong>bolletjes en pins</strong> zijn gemeten warmte en officiële meldingen
            van de afgelopen 24 uur — losse bronnen, en de cijfers tellen metingen, geen branden.
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
                    background: "var(--hittebron)",
                    borderRadius: "50% 50% 50% 0",
                    transform: "rotate(45deg)",
                  }}
                />{" "}
                losse satellietmeting
              </span>
              <span>
                <i style={{ background: "var(--hittebron)", borderRadius: "50%" }} /> bolletje met aantal
                metingen
              </span>
            </>
          )}
          <span>
            <i
              style={{
                background: "var(--officieel)",
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
        {!embed && (
          <p style={{ margin: "8px 0 0" }}>
            <a href="https://www.nederlanders.fr/page/bosbranden">
              Deze tool staat ook op nederlanders.fr
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
