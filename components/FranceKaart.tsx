"use client";

import { useEffect, useRef, useState } from "react";
import { DEP_BY_CODE } from "@/lib/departements";
import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import { projecteerCoordinaat } from "@/lib/kaart-projectie";
import { niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import type { Waarneming } from "@/lib/waarnemingen";
import type { Niveaus } from "@/components/Tool";
import styles from "@/components/Waarnemingen.module.css";

const MIN_ZOOM = 1;
const MAX_ZOOM = 24;

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface SchermPunt {
  x: number;
  y: number;
}

interface NieuwsItem {
  titel: string;
  url: string;
  bron: string;
  gepubliceerdOp: string | null;
}

interface NieuwsAntwoord {
  beschikbaar: boolean;
  items: NieuwsItem[];
  bijgewerkt: string | null;
  opmerking?: string;
}

export default function FranceKaart({
  niveaus,
  echeance,
  gekozen,
  onKies,
  waarnemingen,
  toonWaarnemingen,
  gekozenWaarneming,
  onKiesWaarneming,
}: {
  niveaus: Niveaus;
  echeance: "j1" | "j2";
  gekozen: string | null;
  onKies: (code: string) => void;
  waarnemingen: Waarneming[];
  toonWaarnemingen: boolean;
  gekozenWaarneming: string | null;
  onKiesWaarneming: (id: string) => void;
}) {
  const [kaartX, kaartY, kaartBreedte, kaartHoogte] = KAART_VIEWBOX.split(" ").map(Number);
  const [camera, setCamera] = useState<Camera>({
    x: kaartX,
    y: kaartY,
    zoom: MIN_ZOOM,
  });
  const [nieuws, setNieuws] = useState<NieuwsAntwoord | null>(null);
  const [nieuwsLaden, setNieuwsLaden] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const pointersRef = useRef(new Map<number, SchermPunt>());
  const gestureRef = useRef<{
    laatsteMidden: SchermPunt | null;
    laatsteAfstand: number | null;
  }>({ laatsteMidden: null, laatsteAfstand: null });
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    let actief = true;

    (async () => {
      try {
        const res = await fetch("/api/nieuws");
        const json: NieuwsAntwoord = await res.json();
        if (actief) setNieuws(json);
      } catch {
        if (actief) {
          setNieuws({
            beschikbaar: false,
            items: [],
            bijgewerkt: null,
            opmerking: "Actueel nieuws is tijdelijk niet beschikbaar.",
          });
        }
      } finally {
        if (actief) setNieuwsLaden(false);
      }
    })();

    return () => {
      actief = false;
    };
  }, []);

  const zichtbareBreedte = kaartBreedte / camera.zoom;
  const zichtbareHoogte = kaartHoogte / camera.zoom;

  const gekozenPunt =
    toonWaarnemingen && gekozenWaarneming
      ? waarnemingen.find((waarneming) => waarneming.id === gekozenWaarneming) ?? null
      : null;
  const popupCoordinaat = gekozenPunt
    ? projecteerCoordinaat(gekozenPunt.longitude, gekozenPunt.latitude)
    : null;
  const popupSchermX = popupCoordinaat
    ? ((popupCoordinaat.x - camera.x) / zichtbareBreedte) * 100
    : 0;
  const popupSchermY = popupCoordinaat
    ? ((popupCoordinaat.y - camera.y) / zichtbareHoogte) * 100
    : 0;

  let popupPositieKlasse = styles.popupRechtsOnder;
  if (popupCoordinaat) {
    const linksVanPin = popupSchermX > 62;
    const bovenPin = popupSchermY > 62;

    if (linksVanPin && bovenPin) popupPositieKlasse = styles.popupLinksBoven;
    else if (linksVanPin) popupPositieKlasse = styles.popupLinksOnder;
    else if (bovenPin) popupPositieKlasse = styles.popupRechtsBoven;
  }

  function begrensCamera(volgende: Camera): Camera {
    const zoom = begrens(volgende.zoom, MIN_ZOOM, MAX_ZOOM);
    const breedte = kaartBreedte / zoom;
    const hoogte = kaartHoogte / zoom;

    return {
      zoom,
      x: begrens(volgende.x, kaartX, kaartX + kaartBreedte - breedte),
      y: begrens(volgende.y, kaartY, kaartY + kaartHoogte - hoogte),
    };
  }

  function zoomNaar(nieuweZoom: number, clientX?: number, clientY?: number) {
    setCamera((huidig) => {
      const zoom = begrens(nieuweZoom, MIN_ZOOM, MAX_ZOOM);
      if (zoom === huidig.zoom) return huidig;

      const rect = svgRef.current?.getBoundingClientRect();
      const oudeBreedte = kaartBreedte / huidig.zoom;
      const oudeHoogte = kaartHoogte / huidig.zoom;
      const ankerX =
        rect && clientX !== undefined
          ? huidig.x + ((clientX - rect.left) / rect.width) * oudeBreedte
          : huidig.x + oudeBreedte / 2;
      const ankerY =
        rect && clientY !== undefined
          ? huidig.y + ((clientY - rect.top) / rect.height) * oudeHoogte
          : huidig.y + oudeHoogte / 2;
      const verhoudingX =
        rect && clientX !== undefined ? (clientX - rect.left) / rect.width : 0.5;
      const verhoudingY =
        rect && clientY !== undefined ? (clientY - rect.top) / rect.height : 0.5;
      const nieuweBreedte = kaartBreedte / zoom;
      const nieuweHoogte = kaartHoogte / zoom;

      return begrensCamera({
        zoom,
        x: ankerX - verhoudingX * nieuweBreedte,
        y: ankerY - verhoudingY * nieuweHoogte,
      });
    });
  }

  function registreerPointers() {
    const punten = [...pointersRef.current.values()];
    if (punten.length >= 2) {
      gestureRef.current = {
        laatsteMidden: midden(punten[0], punten[1]),
        laatsteAfstand: afstand(punten[0], punten[1]),
      };
    } else {
      gestureRef.current = {
        laatsteMidden: punten[0] ?? null,
        laatsteAfstand: null,
      };
    }
  }

  return (
    <div className={styles.kaartEnNieuws}>
      <div className={styles.kaartContainer}>
        <div className={styles.kaartViewport}>
          <div className={styles.zoomBediening} role="group" aria-label="Kaart in- en uitzoomen">
            <button
              type="button"
              aria-label="Inzoomen"
              disabled={camera.zoom >= MAX_ZOOM}
              onClick={() => zoomNaar(camera.zoom * 1.5)}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Uitzoomen"
              disabled={camera.zoom <= MIN_ZOOM}
              onClick={() => zoomNaar(camera.zoom / 1.5)}
            >
              −
            </button>
            <button
              type="button"
              className={styles.zoomReset}
              disabled={camera.zoom === MIN_ZOOM}
              onClick={() => setCamera({ x: kaartX, y: kaartY, zoom: MIN_ZOOM })}
            >
              Heel Frankrijk
            </button>
          </div>

          <svg
            ref={svgRef}
            className={`kaart-vlak ${styles.zoomKaart}`}
            viewBox={`${camera.x} ${camera.y} ${zichtbareBreedte} ${zichtbareHoogte}`}
            role="group"
            aria-label={`Kaart van Frankrijk met bosbrandgevaar per departement (${
              echeance === "j1" ? "morgen" : "overmorgen"
            })${toonWaarnemingen ? " en satellietwaarnemingen van de afgelopen 24 uur" : ""}`}
            onWheel={(e) => {
              e.preventDefault();
              zoomNaar(camera.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              zoomNaar(camera.zoom * 1.6, e.clientX, e.clientY);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === "mouse") return;
              e.currentTarget.setPointerCapture(e.pointerId);
              pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              wasDraggingRef.current = false;
              registreerPointers();
            }}
            onPointerMove={(e) => {
              if (!pointersRef.current.has(e.pointerId)) return;
              const vorige = pointersRef.current.get(e.pointerId);
              const huidigPunt = { x: e.clientX, y: e.clientY };
              pointersRef.current.set(e.pointerId, huidigPunt);

              const rect = svgRef.current?.getBoundingClientRect();
              if (!rect) return;

              const punten = [...pointersRef.current.values()];
              if (punten.length >= 2) {
                const nieuwMidden = midden(punten[0], punten[1]);
                const nieuweAfstand = afstand(punten[0], punten[1]);
                const vorigMidden = gestureRef.current.laatsteMidden;
                const vorigeAfstand = gestureRef.current.laatsteAfstand;

                if (vorigMidden && vorigeAfstand && vorigeAfstand > 0) {
                  const zoomFactor = nieuweAfstand / vorigeAfstand;
                  setCamera((huidigeCamera) => {
                    const zoom = begrens(
                      huidigeCamera.zoom * zoomFactor,
                      MIN_ZOOM,
                      MAX_ZOOM
                    );
                    const oudeBreedte = kaartBreedte / huidigeCamera.zoom;
                    const oudeHoogte = kaartHoogte / huidigeCamera.zoom;
                    const ankerX =
                      huidigeCamera.x +
                      ((nieuwMidden.x - rect.left) / rect.width) * oudeBreedte;
                    const ankerY =
                      huidigeCamera.y +
                      ((nieuwMidden.y - rect.top) / rect.height) * oudeHoogte;
                    const nieuweBreedte = kaartBreedte / zoom;
                    const nieuweHoogte = kaartHoogte / zoom;
                    const verschuivingX =
                      ((nieuwMidden.x - vorigMidden.x) / rect.width) * nieuweBreedte;
                    const verschuivingY =
                      ((nieuwMidden.y - vorigMidden.y) / rect.height) * nieuweHoogte;

                    return begrensCamera({
                      zoom,
                      x:
                        ankerX -
                        ((nieuwMidden.x - rect.left) / rect.width) * nieuweBreedte -
                        verschuivingX,
                      y:
                        ankerY -
                        ((nieuwMidden.y - rect.top) / rect.height) * nieuweHoogte -
                        verschuivingY,
                    });
                  });
                  wasDraggingRef.current = true;
                }

                gestureRef.current = {
                  laatsteMidden: nieuwMidden,
                  laatsteAfstand: nieuweAfstand,
                };
                return;
              }

              if (vorige && gestureRef.current.laatsteMidden) {
                const dx = huidigPunt.x - vorige.x;
                const dy = huidigPunt.y - vorige.y;
                if (Math.abs(dx) + Math.abs(dy) > 2) wasDraggingRef.current = true;

                setCamera((huidigeCamera) =>
                  begrensCamera({
                    ...huidigeCamera,
                    x:
                      huidigeCamera.x -
                      (dx / rect.width) * (kaartBreedte / huidigeCamera.zoom),
                    y:
                      huidigeCamera.y -
                      (dy / rect.height) * (kaartHoogte / huidigeCamera.zoom),
                  })
                );
                gestureRef.current.laatsteMidden = huidigPunt;
              }
            }}
            onPointerUp={(e) => {
              pointersRef.current.delete(e.pointerId);
              registreerPointers();
            }}
            onPointerCancel={(e) => {
              pointersRef.current.delete(e.pointerId);
              registreerPointers();
            }}
          >
            {KAART_PADEN.map((pad) => {
              const waarde = niveaus[pad.code]?.[echeance] ?? null;
              const niveau = niveauVoor(waarde);
              const label = `${pad.naam} (${pad.code}): ${
                niveau ? `niveau ${niveau.nl}` : "geen gegevens"
              }`;
              return (
                <path
                  key={pad.code}
                  className={`dep${gekozen === pad.code ? " gekozen" : ""}`}
                  data-dep={pad.code}
                  d={pad.d}
                  fill={niveau ? niveau.kleur : GEEN_DATA_KLEUR}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={gekozen === pad.code}
                  onClick={() => {
                    if (wasDraggingRef.current) return;
                    onKies(pad.code);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onKies(pad.code);
                    }
                  }}
                >
                  <title>{label}</title>
                </path>
              );
            })}

            {toonWaarnemingen &&
              waarnemingen.map((waarneming) => {
                const { x, y } = projecteerCoordinaat(
                  waarneming.longitude,
                  waarneming.latitude
                );
                const geselecteerd = gekozenWaarneming === waarneming.id;
                const label = `Satellietwaarneming in departement ${waarneming.departementCode}, betrouwbaarheid ${
                  waarneming.betrouwbaarheid
                }, ${formatteerKorteDatum(waarneming.waargenomenOp)}`;

                return (
                  <g
                    key={waarneming.id}
                    className={`${styles.mapPin}${
                      geselecteerd ? ` ${styles.mapPinSelected}` : ""
                    }`}
                    transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(
                      1 / camera.zoom
                    ).toFixed(4)})`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-pressed={geselecteerd}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (wasDraggingRef.current) return;
                      onKiesWaarneming(waarneming.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onKiesWaarneming(waarneming.id);
                      }
                    }}
                  >
                    <title>{label}</title>
                    <path d="M0-15.5C-8.3-15.5-13.8-9.8-13.8-1.9C-13.8 7.8 0 19.2 0 19.2S13.8 7.8 13.8-1.9C13.8-9.8 8.3-15.5 0-15.5Z" />
                    <circle cy="-1.9" r="4.1" />
                  </g>
                );
              })}
          </svg>

          {gekozenPunt && popupCoordinaat && (
            <div
              className={`${styles.pinPopup} ${popupPositieKlasse}`}
              style={{
                left: `${begrens(popupSchermX, 0, 100)}%`,
                top: `${begrens(popupSchermY, 0, 100)}%`,
              }}
              role="dialog"
              aria-modal="false"
              aria-labelledby="satelliet-popup-titel"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={styles.popupSluit}
                aria-label="Kaartje sluiten"
                onClick={() => onKiesWaarneming(gekozenPunt.id)}
              >
                ×
              </button>

              <h3 id="satelliet-popup-titel">
                Satellietwaarneming{" "}
                <span className="dep-code">{gekozenPunt.departementCode}</span>
              </h3>

              <div className={styles.detailGrid}>
                <span className={styles.detailLabel}>Locatie</span>
                <span>
                  {DEP_BY_CODE[gekozenPunt.departementCode]?.naam ??
                    `departement ${gekozenPunt.departementCode}`}
                  <br />
                  {gekozenPunt.latitude.toFixed(4)}, {gekozenPunt.longitude.toFixed(4)}
                </span>

                <span className={styles.detailLabel}>Waargenomen</span>
                <span>{formatteerDatum(gekozenPunt.waargenomenOp)}</span>

                <span className={styles.detailLabel}>Sensor</span>
                <span>
                  {gekozenPunt.instrument} · {gekozenPunt.satelliet}
                  {gekozenPunt.dagNacht ? ` · ${gekozenPunt.dagNacht}` : ""}
                </span>

                <span className={styles.detailLabel}>Betrouwbaarheid</span>
                <span>{gekozenPunt.betrouwbaarheid}</span>

                {gekozenPunt.frp !== null && (
                  <>
                    <span className={styles.detailLabel}>FRP</span>
                    <span>{formatteerGetal(gekozenPunt.frp)} MW</span>
                  </>
                )}
              </div>

              <p className={styles.popupBron}>
                Bron:{" "}
                <a
                  href="https://firms.modaps.eosdis.nasa.gov/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  NASA FIRMS — VIIRS
                </a>
              </p>
              <p className={styles.caveat}>
                Gemeten hittebron; niet automatisch een door de Franse autoriteiten bevestigde
                natuurbrand. FRP is het geschatte uitgestraalde vermogen, niet het verbrande
                oppervlak.
              </p>
            </div>
          )}
        </div>

        <p className={styles.zoomUitleg}>
          Zoom met de knoppen, het muiswiel of twee vingers. Sleep om de kaart te verplaatsen.
        </p>
      </div>

      <section className={styles.nieuwsBlok} aria-labelledby="actueel-nieuws-titel">
        <div className={styles.nieuwsKop}>
          <div>
            <h3 id="actueel-nieuws-titel">Actueel nieuws over natuurbranden</h3>
            <p>De nieuwste journalistieke berichten uit Franse nieuwsbronnen.</p>
          </div>
          <a
            className={styles.officieleLink}
            href="https://fr-alert.gouv.fr/les-alertes"
            target="_blank"
            rel="noopener noreferrer"
          >
            Officiële FR-Alert-waarschuwingen
          </a>
        </div>

        {nieuwsLaden && <p className={styles.nieuwsStatus}>Nieuws laden…</p>}
        {!nieuwsLaden && (!nieuws?.beschikbaar || nieuws.items.length === 0) && (
          <p className={styles.nieuwsStatus}>
            {nieuws?.opmerking ?? "Er zijn momenteel geen recente berichten gevonden."}
          </p>
        )}
        {!nieuwsLaden && nieuws?.beschikbaar && nieuws.items.length > 0 && (
          <ol className={styles.nieuwsLijst}>
            {nieuws.items.map((item) => (
              <li key={`${item.url}-${item.titel}`}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.titel}
                </a>
                <span>
                  {item.bron}
                  {item.gepubliceerdOp
                    ? ` · ${formatteerNieuwsDatum(item.gepubliceerdOp)}`
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className={styles.nieuwsNoot}>
          Nieuwsberichten zijn geen officiële veiligheidswaarschuwingen. Volg bij gevaar
          FR-Alert, de prefectuur en de hulpdiensten.
        </p>
      </section>
    </div>
  );
}

function begrens(waarde: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, waarde));
}

function afstand(a: SchermPunt, b: SchermPunt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midden(a: SchermPunt, b: SchermPunt): SchermPunt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function formatteerKorteDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}

function formatteerDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

function formatteerNieuwsDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}

function formatteerGetal(waarde: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(waarde);
}
