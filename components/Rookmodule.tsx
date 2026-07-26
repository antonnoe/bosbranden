"use client";

// Rookmodule — toont de berekende windbaan (pluim) vanaf gedetecteerde
// hittebronnen. Alle zware berekening staat server-side in lib/rookdrift.ts;
// deze component tekent alleen de compacte, uitgerekende pluimen.

import { useEffect, useMemo, useRef, useState } from "react";
import { KAART_PADEN } from "@/lib/kaart-paths";
import { projecteerCoordinaat } from "@/lib/kaart-projectie";
import Voortgang from "@/components/Voortgang";
import EmbedHoogte from "@/components/EmbedHoogte";
import styles from "@/components/Rookmodule.module.css";

// Ruimere viewBox dan de departementsgrenzen (0 0 1000 959), zodat pluimen die
// Frankrijk verlaten — bij mistral en tramontane gebeurt dat vaak — zichtbaar
// blijven. Dat is relevante informatie, geen fout.
const ROOK_VIEWBOX = { x: -300, y: -110, w: 1600, h: 1180 };

// Kaarteenheden per kilometer, afgeleid uit de projectie (1° breedte ≈ SCHAAL
// eenheden ≈ 111,32 km).
const EEN_GRAAD = Math.abs(
  projecteerCoordinaat(0, 46).y - projecteerCoordinaat(0, 47).y
);
const EENHEDEN_PER_KM = EEN_GRAAD / 111.32;
const DEG = Math.PI / 180;

const LAAD_FASEN = [
  "Satellietwaarnemingen ophalen bij NASA FIRMS…",
  "Windveld ophalen bij Open-Meteo…",
  "Hittebronnen clusteren…",
  "Windbanen berekenen…",
];

// PM2.5-klassen (µg/m³). Onder de WHO-daggrens van 15 wordt niets getekend:
// schone lucht hoort onzichtbaar te zijn, niet lichtgrijs. Daarboven lopen de
// klassen op in donkerte en dekking, zodat een echte piek (zoals boven de
// brandhaard) als onmiskenbare vlek verschijnt in plaats van een egale waas.
const WHO_DAGGRENS_PM25 = 15;
const PM25_KLASSEN = [
  { min: 15, kleur: "168, 130, 195", kernAlpha: 0.5, label: "15–35", duiding: "verhoogd" },
  { min: 35, kleur: "142, 78, 168", kernAlpha: 0.62, label: "35–75", duiding: "hoog" },
  { min: 75, kleur: "108, 34, 132", kernAlpha: 0.74, label: "75–150", duiding: "zeer hoog" },
  { min: 150, kleur: "72, 12, 92", kernAlpha: 0.86, label: "≥150", duiding: "extreem" },
] as const;

function pm25KlasseIndex(waarde: number): number {
  if (!Number.isFinite(waarde) || waarde < WHO_DAGGRENS_PM25) return -1;
  for (let i = PM25_KLASSEN.length - 1; i >= 0; i -= 1) {
    if (waarde >= PM25_KLASSEN[i].min) return i;
  }
  return -1;
}

type Windmodus = "leefniveau" | "ophoogte";

interface Pluim {
  id: string;
  lat: number;
  lon: number;
  detecties: number;
  frp: number | null;
  laatsteDetectie: string;
  bronDepartement: string | null;
  bronDepartementCode: string | null;
  leefniveau: Array<[number, number]>;
  ophoogte: Array<[number, number]>;
  kmLeefniveau: number;
  kmOphoogte: number;
  richting: string;
}

interface FijnstofGridpunt {
  lat: number;
  lon: number;
  pm25: Array<number | null>;
}

interface Antwoord {
  beschikbaar: boolean;
  windBeschikbaar: boolean;
  bijgewerkt: string | null;
  startuur: string;
  opmerking?: string;
  pluimen: Pluim[];
  fijnstof?: { grid: FijnstofGridpunt[]; uren: string[] };
}

interface PostcodeAntwoord {
  status: string;
  tekst: string;
  bronId?: string;
  modus?: Windmodus;
  vroegsteUur?: number;
}

export default function Rookmodule({ embed }: { embed: boolean }) {
  const [data, setData] = useState<Antwoord | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);

  const [uur, setUur] = useState(24);
  const [modus, setModus] = useState<Windmodus>("leefniveau");
  const [gekozenId, setGekozenId] = useState<string | null>(null);

  const [toonFijnstof, setToonFijnstof] = useState(false);
  const [fijnstof, setFijnstof] = useState<{ grid: FijnstofGridpunt[]; uren: string[] } | null>(null);
  const [fijnstofLaden, setFijnstofLaden] = useState(false);

  const [postcode, setPostcode] = useState("");
  const [postcodeAntwoord, setPostcodeAntwoord] = useState<PostcodeAntwoord | null>(null);
  const [postcodeLaden, setPostcodeLaden] = useState(false);

  const geenBeweging = useRef(false);

  useEffect(() => {
    if (embed) document.documentElement.classList.add("embed");
    geenBeweging.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/rookpluimen");
        const json: Antwoord = await res.json();
        if (!actief) return;
        setData(json);
      } catch {
        if (actief)
          setFout(
            "De rookmodule kon de gegevens niet ophalen. Probeer het over enkele minuten opnieuw."
          );
      } finally {
        if (actief) setLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [embed]);

  // Fijnstof pas ophalen wanneer de gebruiker de laag inschakelt.
  // fijnstofLaden bewust NIET in de deps: dat zou de effect-cleanup de
  // lopende fetch laten afbreken vóór setFijnstof.
  useEffect(() => {
    if (!toonFijnstof || fijnstof) return;
    let actief = true;
    setFijnstofLaden(true);
    (async () => {
      try {
        const res = await fetch("/api/rookpluimen?fijnstof=1");
        const json: Antwoord = await res.json();
        if (actief && json.fijnstof) setFijnstof(json.fijnstof);
      } catch {
        /* stil: laag blijft leeg, kaart blijft werken */
      } finally {
        if (actief) setFijnstofLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [toonFijnstof, fijnstof]);

  const pluimen = data?.pluimen ?? [];
  const gekozen = pluimen.find((p) => p.id === gekozenId) ?? null;

  async function zoekPostcode(e: React.FormEvent) {
    e.preventDefault();
    setPostcodeLaden(true);
    setPostcodeAntwoord(null);
    try {
      const res = await fetch(`/api/rookpluimen?postcode=${encodeURIComponent(postcode.trim())}`);
      const json: Antwoord & { postcode?: PostcodeAntwoord } = await res.json();
      setPostcodeAntwoord(json.postcode ?? null);
      if (json.postcode?.bronId) {
        setGekozenId(json.postcode.bronId);
        if (json.postcode.modus) setModus(json.postcode.modus);
      }
    } catch {
      setPostcodeAntwoord({
        status: "fout",
        tekst: "Het antwoord op uw postcode kon niet worden opgehaald. Probeer het opnieuw.",
      });
    } finally {
      setPostcodeLaden(false);
    }
  }

  const viewBox = `${ROOK_VIEWBOX.x} ${ROOK_VIEWBOX.y} ${ROOK_VIEWBOX.w} ${ROOK_VIEWBOX.h}`;

  return (
    <div className="omhulsel">
      <EmbedHoogte actief={embed} />
      {!embed && (
        <header className="site-kop">
          <h1>Verwachte rookverplaatsing</h1>
          <p>
            Waar waait de lucht naartoe vanaf een gedetecteerde hittebron? Deze module berekent de
            windbaan — geen rookmodel.
          </p>
        </header>
      )}

      {laden && <Voortgang fasen={LAAD_FASEN} />}

      {!laden && fout && (
        <div className="sectie">
          <p className="fout-melding">{fout}</p>
        </div>
      )}

      {!laden && !fout && (
        <>
          {/* ---------- Postcode-antwoord (prominent, boven de kaart) ---------- */}
          <section className="sectie" aria-labelledby="postcode-titel">
            <h2 id="postcode-titel">Komt die rook naar mij toe?</h2>
            <p style={{ marginTop: 0 }}>
              Vul een Franse postcode in (5 cijfers). Dan berekenen we of een van de pluimen in de
              komende 24 uur boven uw departement komt.
            </p>
            <form className="postcode-vorm" onSubmit={zoekPostcode}>
              <label htmlFor="rook-postcode" style={{ position: "absolute", left: "-9999px" }}>
                Franse postcode
              </label>
              <input
                id="rook-postcode"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="bijv. 11000"
                maxLength={5}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
              <button className="knop" type="submit" disabled={postcodeLaden}>
                {postcodeLaden ? "Berekenen…" : "Bekijk mijn departement"}
              </button>
            </form>
            {postcodeAntwoord && (
              <p
                className={`${styles.postcodeAntwoord} ${
                  postcodeAntwoord.status === "ok" && postcodeAntwoord.bronId
                    ? styles.postcodeTreft
                    : ""
                }`}
                role="status"
              >
                {postcodeAntwoord.tekst}
              </p>
            )}
          </section>

          {/* ---------- Statusregel ---------- */}
          <section className="sectie" aria-labelledby="kaart-titel">
            <h2 id="kaart-titel" style={{ marginBottom: 6 }}>
              Kaart van de pluimen
            </h2>
            <p className={styles.status} aria-live="polite">
              {statusTekst(data)}
            </p>

            {/* ---------- Bediening ---------- */}
            {data?.windBeschikbaar && (
              <div className={styles.bediening}>
                <div className={styles.laagKnoppen} role="group" aria-label="Kies de laag">
                  <button
                    type="button"
                    aria-pressed={modus === "leefniveau"}
                    onClick={() => setModus("leefniveau")}
                  >
                    Leefniveau
                  </button>
                  <button
                    type="button"
                    aria-pressed={modus === "ophoogte"}
                    onClick={() => setModus("ophoogte")}
                  >
                    Op hoogte
                  </button>
                </div>
                <p className={styles.laagUitleg}>
                  {modus === "leefniveau"
                    ? "Leefniveau volgt de wind vlak boven de grond — bepalend voor stanklast dichtbij de bron."
                    : "Op hoogte stijgt de pluim mee met het 850 hPa-transportveld — bepalend voor verplaatsing over grotere afstand."}
                </p>

                <label className={styles.tijdSchuif}>
                  <span>
                    Tijd: <strong>{uur === 0 ? "nu" : `+${uur} uur`}</strong>
                    {data?.startuur ? ` (${klok(data.startuur, uur)})` : ""}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={uur}
                    onChange={(e) => setUur(Number(e.target.value))}
                    aria-label="Aantal uren dat de pluimen doorgroeien"
                  />
                </label>

                <label className={styles.fijnstofSchakel}>
                  <input
                    type="checkbox"
                    checked={toonFijnstof}
                    onChange={(e) => setToonFijnstof(e.target.checked)}
                  />
                  Fijnstoflaag tonen (CAMS PM2.5)
                  {toonFijnstof && fijnstofLaden ? " — laden…" : ""}
                </label>
              </div>
            )}

            {/* ---------- Kaart ---------- */}
            <div className={styles.kaartKader}>
              <svg
                className={styles.kaart}
                viewBox={viewBox}
                role="group"
                aria-label="Kaart van Frankrijk met de berekende windbanen vanaf hittebronnen"
              >
                <defs>
                  {PM25_KLASSEN.map((k, i) => (
                    <radialGradient key={`fs-grad-${i}`} id={`fijnstof-${i}`}>
                      <stop offset="0%" stopColor={`rgba(${k.kleur}, ${k.kernAlpha})`} />
                      <stop offset="65%" stopColor={`rgba(${k.kleur}, ${k.kernAlpha * 0.5})`} />
                      <stop offset="100%" stopColor={`rgba(${k.kleur}, 0)`} />
                    </radialGradient>
                  ))}
                  <linearGradient id="pluim-verloop" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(128, 0, 0, 0.42)" />
                    <stop offset="100%" stopColor="rgba(128, 0, 0, 0.06)" />
                  </linearGradient>
                </defs>

                {/* Departementsgrenzen als rustige onderlaag */}
                {KAART_PADEN.map((pad) => (
                  <path key={pad.code} className={styles.departement} d={pad.d} />
                ))}

                {/* Fijnstoflaag (zachte vlakvulling), onder de pluimen.
                    Onder de WHO-daggrens (15 µg/m³) tekenen we niets. */}
                {toonFijnstof &&
                  fijnstof?.grid.map((punt, i) => {
                    const waarde = punt.pm25[Math.min(uur, punt.pm25.length - 1)];
                    if (waarde == null) return null;
                    const klasse = pm25KlasseIndex(waarde);
                    if (klasse < 0) return null;
                    const { x, y } = projecteerCoordinaat(punt.lon, punt.lat);
                    const straal = 1.5 * EEN_GRAAD * 0.8;
                    return (
                      <circle
                        key={`fs-${i}`}
                        cx={x}
                        cy={y}
                        r={straal}
                        fill={`url(#fijnstof-${klasse})`}
                      />
                    );
                  })}

                {/* Pluimen als verlopende kegel */}
                {data?.windBeschikbaar &&
                  pluimen.map((pluim) => (
                    <PluimTekening
                      key={pluim.id}
                      pluim={pluim}
                      modus={modus}
                      uur={uur}
                      gekozen={pluim.id === gekozenId}
                      geenBeweging={geenBeweging.current}
                      onKies={() => setGekozenId((h) => (h === pluim.id ? null : pluim.id))}
                    />
                  ))}

                {/* Bronmarkeringen (ook zichtbaar als de wind uitvalt) */}
                {pluimen.map((pluim) => {
                  const { x, y } = projecteerCoordinaat(pluim.lon, pluim.lat);
                  return (
                    <g
                      key={`bron-${pluim.id}`}
                      className={`${styles.bron} ${pluim.id === gekozenId ? styles.bronGekozen : ""}`}
                      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Hittebron${pluim.bronDepartement ? ` in ${pluim.bronDepartement}` : ""}, ${pluim.detecties} detecties`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGekozenId((h) => (h === pluim.id ? null : pluim.id));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setGekozenId((h) => (h === pluim.id ? null : pluim.id));
                        }
                      }}
                    >
                      <circle r={9} />
                      <circle r={3.4} className={styles.bronKern} />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* ---------- Legenda ---------- */}
            <div className={styles.legenda}>
              <span>
                <i className={styles.legKegel} /> kegel = onzekerheid over de richting, niet de
                hoeveelheid rook
              </span>
              <span>
                <i className={styles.legBron} /> gedetecteerde hittebron
              </span>
            </div>

            {toonFijnstof && (
              <div className={styles.fijnstofLegenda}>
                <span className={styles.fijnstofLegendaTitel}>Fijnstof PM2.5 (µg/m³):</span>
                <div className={styles.fijnstofBanden}>
                  {PM25_KLASSEN.map((k, i) => (
                    <span key={`leg-${i}`} className={styles.fijnstofBand}>
                      <i style={{ background: `rgb(${k.kleur})` }} /> {k.label}
                      <em> ({k.duiding})</em>
                    </span>
                  ))}
                </div>
                <p className={styles.fijnstofRefwaarde}>
                  Onder de <strong>WHO-daggrens van 15 µg/m³</strong> wordt niets getekend
                  (schone lucht). De kleur wordt donkerder naarmate de concentratie stijgt.
                </p>
                <p className={styles.copernicus}>
                  Fijnstoflaag: gegenereerd met Copernicus Atmosphere Monitoring
                  Service-informatie 2026 (CAMS European air quality, via Open-Meteo).
                </p>
              </div>
            )}

            {gekozen && (
              <PluimPaneel
                pluim={gekozen}
                startuur={data?.startuur ?? null}
                onSluit={() => setGekozenId(null)}
              />
            )}
          </section>

          {/* ---------- Verplichte tekstkaders ---------- */}
          <section className="sectie" aria-labelledby="kaders-titel">
            <h2 id="kaders-titel">Belangrijk om te weten</h2>
            <ul className={styles.kaders}>
              <li>
                <strong>Dit is geen rookmodel.</strong> Het is de berekende windbaan vanaf
                gedetecteerde hittebronnen. Werkelijke rook stijgt, mengt, slaat neer en wordt door
                neerslag uitgewassen; dat zit hier niet in.
              </li>
              <li>
                Een VIIRS-detectie is een gemeten thermische anomalie — een satellietwaarneming van
                een hittebron — en <strong>niet automatisch een door de autoriteiten bevestigde
                natuurbrand</strong>.
              </li>
              <li>
                <strong>De onzekerheid groeit met de tijd.</strong> Voorbij 12 uur is het beeld
                indicatief.
              </li>
              <li>
                De kegel toont de onzekerheid over de <strong>richting</strong>, niet de hoeveelheid
                rook.
              </li>
              <li>
                <strong>Zie je rook of vuur: bel 18 of 112</strong> (doven en slechthorenden: 114).
                Volg altijd FR-Alert en de instructies van prefectuur en mairie.
              </li>
            </ul>
          </section>

          <p className={styles.bronregel}>
            Bronnen: hittebronnen —{" "}
            <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
              NASA FIRMS (VIIRS)
            </a>
            ; wind en fijnstof —{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
              Open-Meteo
            </a>{" "}
            (windmodel; fijnstof uit CAMS/Copernicus).
            {data?.bijgewerkt ? ` Gegevens opgehaald: ${volledigeDatum(data.bijgewerkt)}.` : ""}
          </p>

          <footer className="site-voet">
            <p style={{ margin: 0 }}>
              <a href={embed ? "/?embed=1" : "/"}>← Terug naar Brandrisico Frankrijk</a>
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

// ---- Pluim (kegel + centrale lijn) ----

function PluimTekening({
  pluim,
  modus,
  uur,
  gekozen,
  geenBeweging,
  onKies,
}: {
  pluim: Pluim;
  modus: Windmodus;
  uur: number;
  gekozen: boolean;
  geenBeweging: boolean;
  onKies: () => void;
}) {
  const volledigPad = pluim[modus];
  const { kegel, lijn, gesnedenScherm } = useMemo(() => {
    const gesneden = volledigPad.slice(0, Math.min(uur, volledigPad.length - 1) + 1);
    const scherm = gesneden.map(([lon, lat]) => projecteerCoordinaat(lon, lat));

    // Halve breedte per punt = max(8 km, 0,15 × afgelegde afstand).
    const halveBreedtes: number[] = [];
    let cumKm = 0;
    for (let i = 0; i < gesneden.length; i += 1) {
      if (i > 0) {
        cumKm += haversineKm(
          gesneden[i - 1][1],
          gesneden[i - 1][0],
          gesneden[i][1],
          gesneden[i][0]
        );
      }
      const hwKm = Math.max(8, 0.15 * cumKm);
      halveBreedtes.push(hwKm * EENHEDEN_PER_KM);
    }

    return {
      gesnedenScherm: scherm,
      kegel: bouwKegel(scherm, halveBreedtes),
      lijn: scherm.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(""),
    };
  }, [volledigPad, uur]);

  if (gesnedenScherm.length < 2) return null;
  const eind = gesnedenScherm[gesnedenScherm.length - 1];

  return (
    <g
      className={`${styles.pluim} ${gekozen ? styles.pluimGekozen : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Pluim vanaf ${pluim.bronDepartement ?? "een hittebron"}, richting ${pluim.richting}`}
      onClick={(e) => {
        e.stopPropagation();
        onKies();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onKies();
        }
      }}
    >
      <polygon className={styles.kegel} points={kegel} fill="url(#pluim-verloop)" />
      <path className={styles.middenlijn} d={lijn} />
      {!geenBeweging && gesnedenScherm.length > 1 && (
        <circle className={styles.stroomStip} r={3}>
          <animateMotion dur="9s" repeatCount="indefinite" path={lijn} />
        </circle>
      )}
      <circle cx={eind.x} cy={eind.y} r={4} className={styles.pluimKop} />
    </g>
  );
}

function bouwKegel(
  punten: Array<{ x: number; y: number }>,
  halveBreedtes: number[]
): string {
  if (punten.length < 2) return "";
  const links: Array<{ x: number; y: number }> = [];
  const rechts: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < punten.length; i += 1) {
    const vorige = punten[Math.max(0, i - 1)];
    const volgende = punten[Math.min(punten.length - 1, i + 1)];
    let dx = volgende.x - vorige.x;
    let dy = volgende.y - vorige.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const hw = halveBreedtes[i];
    links.push({ x: punten[i].x + nx * hw, y: punten[i].y + ny * hw });
    rechts.push({ x: punten[i].x - nx * hw, y: punten[i].y - ny * hw });
  }

  const rand = [...links, ...rechts.reverse()];
  return rand.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

// ---- Detailpaneel van een gekozen pluim ----

function PluimPaneel({
  pluim,
  startuur,
  onSluit,
}: {
  pluim: Pluim;
  startuur: string | null;
  onSluit: () => void;
}) {
  return (
    <div className="dep-paneel" aria-live="polite">
      <div className="paneel-kop">
        <h3>
          Pluim vanaf {pluim.bronDepartement ?? "een hittebron"}{" "}
          {pluim.bronDepartementCode ? (
            <span className="dep-code">{pluim.bronDepartementCode}</span>
          ) : null}
        </h3>
        <button type="button" className="paneel-sluit" aria-label="Paneel sluiten" onClick={onSluit}>
          ×
        </button>
      </div>
      <div className={styles.detailGrid}>
        <span className={styles.detailLabel}>Detecties</span>
        <span>{pluim.detecties} VIIRS-detecties in dit cluster</span>
        {pluim.frp != null && (
          <>
            <span className={styles.detailLabel}>FRP (som)</span>
            <span>{formatteerGetal(pluim.frp)} MW</span>
          </>
        )}
        <span className={styles.detailLabel}>Laatste detectie</span>
        <span>{volledigeDatum(pluim.laatsteDetectie)}</span>
        <span className={styles.detailLabel}>Driftrichting</span>
        <span>{pluim.richting || "onbekend"}</span>
        <span className={styles.detailLabel}>Afgelegd (leefniveau)</span>
        <span>{pluim.kmLeefniveau} km in 24 uur</span>
        <span className={styles.detailLabel}>Afgelegd (op hoogte)</span>
        <span>{pluim.kmOphoogte} km in 24 uur</span>
      </div>
      <p className={styles.paneelNoot}>
        Een cluster van detecties is één brandhaard, niet één brand per detectie. FRP is het
        geschatte uitgestraalde vermogen en zegt niets over het verbrande oppervlak.
      </p>
    </div>
  );
}

// ---- Hulpfuncties ----

function statusTekst(data: Antwoord | null): string {
  if (!data) return "Gegevens laden…";
  if (!data.beschikbaar) return data.opmerking ?? "De pluimen zijn tijdelijk niet beschikbaar.";
  if (data.pluimen.length === 0)
    return data.opmerking ?? "Er zijn geen pluimen om te tekenen.";
  if (!data.windBeschikbaar)
    return (
      data.opmerking ??
      "De hittebronnen worden getoond; de windbanen zijn tijdelijk niet beschikbaar."
    );
  const n = data.pluimen.length;
  return `${n} ${n === 1 ? "pluim" : "pluimen"} berekend vanaf de grootste gedetecteerde hittebronnen. Een groot brandcomplex krijgt meerdere oorsprongen langs de vuurlijn.`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function klok(startuur: string, urenErbij: number): string {
  const d = new Date(startuur);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCHours(d.getUTCHours() + urenErbij);
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}

function volledigeDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

function formatteerGetal(waarde: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(waarde);
}
