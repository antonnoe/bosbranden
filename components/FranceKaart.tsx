"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEP_BY_CODE } from "@/lib/departements";
import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import { projecteerCoordinaat } from "@/lib/kaart-projectie";
import { niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import type { FrAlertAntwoord, FrAlertMelding } from "@/lib/fr-alert";
import type { Waarneming } from "@/lib/waarnemingen";
import type { Niveaus } from "@/components/Tool";
import styles from "@/components/Waarnemingen.module.css";
import clusterStyles from "@/components/KaartClusters.module.css";
import laagStyles from "@/components/BrandLagen.module.css";

const MIN_ZOOM = 1;
const MAX_ZOOM = 24;
const SLEEPDREMPEL = 6;

type Weergave = "alle" | "waarschijnlijk" | "officieel";

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

interface GeprojecteerdeWaarneming {
  waarneming: Waarneming;
  x: number;
  y: number;
}

interface GeprojecteerdeMelding {
  melding: FrAlertMelding;
  x: number;
  y: number;
}

interface ClusterMarker {
  type: "cluster";
  id: string;
  x: number;
  y: number;
  punten: GeprojecteerdeWaarneming[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface PinMarker {
  type: "pin";
  id: string;
  x: number;
  y: number;
  punt: GeprojecteerdeWaarneming;
}

type Marker = ClusterMarker | PinMarker;

interface ClusterSelectie {
  x: number;
  y: number;
  punten: GeprojecteerdeWaarneming[];
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
  const [camera, setCamera] = useState<Camera>({ x: kaartX, y: kaartY, zoom: MIN_ZOOM });
  const [clusterSelectie, setClusterSelectie] = useState<ClusterSelectie | null>(null);
  const [weergave, setWeergave] = useState<Weergave>("alle");
  const [frAlert, setFrAlert] = useState<FrAlertAntwoord | null>(null);
  const [frAlertLaden, setFrAlertLaden] = useState(false);
  const [gekozenMeldingId, setGekozenMeldingId] = useState<string | null>(null);
  const [nieuwsOpen, setNieuwsOpen] = useState(false);
  const [nieuws, setNieuws] = useState<NieuwsAntwoord | null>(null);
  const [nieuwsLaden, setNieuwsLaden] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const pointersRef = useRef(new Map<number, SchermPunt>());
  const gestureRef = useRef<{
    laatsteMidden: SchermPunt | null;
    laatsteAfstand: number | null;
  }>({ laatsteMidden: null, laatsteAfstand: null });
  const wasDraggingRef = useRef(false);
  const startPuntRef = useRef<SchermPunt | null>(null);

  useEffect(() => {
    if (weergave !== "officieel" || frAlert || frAlertLaden) return;
    let actief = true;
    setFrAlertLaden(true);

    (async () => {
      try {
        const res = await fetch("/api/fr-alert", { cache: "no-store" });
        const json: FrAlertAntwoord = await res.json();
        if (actief) setFrAlert(json);
      } catch {
        if (actief) {
          setFrAlert({
            beschikbaar: false,
            meldingen: [],
            bijgewerkt: null,
            bron: "FR-Alert",
            opmerking: "Officiële FR-Alert-meldingen zijn tijdelijk niet beschikbaar.",
          });
        }
      } finally {
        if (actief) setFrAlertLaden(false);
      }
    })();

    return () => {
      actief = false;
    };
  }, [weergave, frAlert, frAlertLaden]);

  const zichtbareBreedte = kaartBreedte / camera.zoom;
  const zichtbareHoogte = kaartHoogte / camera.zoom;
  const waarschijnlijkeAantal = useMemo(
    () => waarnemingen.filter((waarneming) => waarneming.waarschijnlijkNatuurbrand).length,
    [waarnemingen]
  );
  const gefilterdeWaarnemingen = useMemo(() => {
    if (weergave === "officieel") return [];
    if (weergave === "waarschijnlijk") {
      return waarnemingen.filter((waarneming) => waarneming.waarschijnlijkNatuurbrand);
    }
    return waarnemingen;
  }, [waarnemingen, weergave]);

  const geprojecteerdeWaarnemingen = useMemo<GeprojecteerdeWaarneming[]>(
    () =>
      gefilterdeWaarnemingen.map((waarneming) => {
        const { x, y } = projecteerCoordinaat(waarneming.longitude, waarneming.latitude);
        return { waarneming, x, y };
      }),
    [gefilterdeWaarnemingen]
  );

  const geprojecteerdeMeldingen = useMemo<GeprojecteerdeMelding[]>(
    () =>
      (frAlert?.meldingen ?? []).map((melding) => {
        const { x, y } = projecteerCoordinaat(melding.longitude, melding.latitude);
        return { melding, x, y };
      }),
    [frAlert]
  );

  const markers = useMemo<Marker[]>(() => {
    if (!toonWaarnemingen || weergave === "officieel") return [];

    const kolommen = camera.zoom < 2.5 ? 9 : camera.zoom < 7 ? 12 : camera.zoom < 15 ? 16 : 20;
    const rijen = Math.max(7, Math.round(kolommen * 0.82));
    const celBreedte = zichtbareBreedte / kolommen;
    const celHoogte = zichtbareHoogte / rijen;
    const margeX = celBreedte * 0.6;
    const margeY = celHoogte * 0.6;
    const groepen = new Map<string, GeprojecteerdeWaarneming[]>();

    for (const punt of geprojecteerdeWaarnemingen) {
      if (
        punt.x < camera.x - margeX ||
        punt.x > camera.x + zichtbareBreedte + margeX ||
        punt.y < camera.y - margeY ||
        punt.y > camera.y + zichtbareHoogte + margeY
      ) {
        continue;
      }

      const kolom = Math.floor((punt.x - camera.x) / celBreedte);
      const rij = Math.floor((punt.y - camera.y) / celHoogte);
      const sleutel = `${kolom}:${rij}`;
      const groep = groepen.get(sleutel);
      if (groep) groep.push(punt);
      else groepen.set(sleutel, [punt]);
    }

    return [...groepen.entries()].map(([sleutel, punten]) => {
      if (punten.length === 1) {
        const punt = punten[0];
        return {
          type: "pin",
          id: punt.waarneming.id,
          x: punt.x,
          y: punt.y,
          punt,
        } satisfies PinMarker;
      }

      let somX = 0;
      let somY = 0;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const punt of punten) {
        somX += punt.x;
        somY += punt.y;
        minX = Math.min(minX, punt.x);
        maxX = Math.max(maxX, punt.x);
        minY = Math.min(minY, punt.y);
        maxY = Math.max(maxY, punt.y);
      }

      return {
        type: "cluster",
        id: `cluster-${sleutel}-${punten.length}`,
        x: somX / punten.length,
        y: somY / punten.length,
        punten,
        minX,
        maxX,
        minY,
        maxY,
      } satisfies ClusterMarker;
    });
  }, [
    camera.x,
    camera.y,
    camera.zoom,
    geprojecteerdeWaarnemingen,
    toonWaarnemingen,
    weergave,
    zichtbareBreedte,
    zichtbareHoogte,
  ]);

  const gekozenPunt =
    weergave !== "officieel" && toonWaarnemingen && gekozenWaarneming
      ? geprojecteerdeWaarnemingen.find(
          (punt) => punt.waarneming.id === gekozenWaarneming
        ) ?? null
      : null;
  const gekozenMelding =
    weergave === "officieel" && gekozenMeldingId
      ? geprojecteerdeMeldingen.find((punt) => punt.melding.id === gekozenMeldingId) ?? null
      : null;

  const popupCoordinaat = gekozenPunt ? { x: gekozenPunt.x, y: gekozenPunt.y } : null;
  const meldingCoordinaat = gekozenMelding ? { x: gekozenMelding.x, y: gekozenMelding.y } : null;
  const actievePopupCoordinaat = clusterSelectie ?? meldingCoordinaat ?? popupCoordinaat;
  const popupSchermX = actievePopupCoordinaat
    ? ((actievePopupCoordinaat.x - camera.x) / zichtbareBreedte) * 100
    : 0;
  const popupSchermY = actievePopupCoordinaat
    ? ((actievePopupCoordinaat.y - camera.y) / zichtbareHoogte) * 100
    : 0;

  let popupPositieKlasse = styles.popupRechtsOnder;
  if (actievePopupCoordinaat) {
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

  function cameraRondPunt(zoom: number, x: number, y: number): Camera {
    const breedte = kaartBreedte / zoom;
    const hoogte = kaartHoogte / zoom;
    return begrensCamera({ zoom, x: x - breedte / 2, y: y - hoogte / 2 });
  }

  function zoomNaar(nieuweZoom: number, clientX?: number, clientY?: number) {
    setClusterSelectie(null);
    setGekozenMeldingId(null);
    setCamera((huidig) => {
      const zoom = begrens(nieuweZoom, MIN_ZOOM, MAX_ZOOM);
      if (zoom === huidig.zoom) return huidig;

      const rect = svgRef.current?.getBoundingClientRect();
      const oudeBreedte = kaartBreedte / huidig.zoom;
      const oudeHoogte = kaartHoogte / huidig.zoom;
      const verhoudingX =
        rect && clientX !== undefined ? begrens((clientX - rect.left) / rect.width, 0, 1) : 0.5;
      const verhoudingY =
        rect && clientY !== undefined ? begrens((clientY - rect.top) / rect.height, 0, 1) : 0.5;
      const ankerX = huidig.x + verhoudingX * oudeBreedte;
      const ankerY = huidig.y + verhoudingY * oudeHoogte;
      const nieuweBreedte = kaartBreedte / zoom;
      const nieuweHoogte = kaartHoogte / zoom;

      return begrensCamera({
        zoom,
        x: ankerX - verhoudingX * nieuweBreedte,
        y: ankerY - verhoudingY * nieuweHoogte,
      });
    });
  }

  function zoomNaarCluster(cluster: ClusterMarker) {
    setClusterSelectie(null);
    if (gekozenWaarneming) onKiesWaarneming(gekozenWaarneming);

    const spreidingX = Math.max(cluster.maxX - cluster.minX, kaartBreedte / MAX_ZOOM / 3);
    const spreidingY = Math.max(cluster.maxY - cluster.minY, kaartHoogte / MAX_ZOOM / 3);
    const passendZoom = Math.min(
      kaartBreedte / (spreidingX * 2.8),
      kaartHoogte / (spreidingY * 2.8)
    );
    const doelZoom = begrens(
      Math.max(camera.zoom * 2.35, Math.min(passendZoom, camera.zoom * 4)),
      MIN_ZOOM,
      MAX_ZOOM
    );

    if (camera.zoom >= MAX_ZOOM * 0.92 || doelZoom <= camera.zoom * 1.08) {
      setClusterSelectie({ x: cluster.x, y: cluster.y, punten: cluster.punten });
      return;
    }

    setCamera(cameraRondPunt(doelZoom, cluster.x, cluster.y));
  }

  function registreerPointers() {
    const punten = [...pointersRef.current.values()];
    if (punten.length >= 2) {
      gestureRef.current = {
        laatsteMidden: midden(punten[0], punten[1]),
        laatsteAfstand: afstand(punten[0], punten[1]),
      };
    } else {
      gestureRef.current = { laatsteMidden: punten[0] ?? null, laatsteAfstand: null };
    }
  }

  function kiesWeergave(volgende: Weergave) {
    if (weergave === volgende) return;
    setWeergave(volgende);
    setClusterSelectie(null);
    setGekozenMeldingId(null);
    if (gekozenWaarneming) onKiesWaarneming(gekozenWaarneming);
    setCamera({ x: kaartX, y: kaartY, zoom: MIN_ZOOM });
  }

  async function wisselNieuws() {
    if (nieuwsOpen) {
      setNieuwsOpen(false);
      return;
    }

    setNieuwsOpen(true);
    if (nieuws || nieuwsLaden) return;

    setNieuwsLaden(true);
    try {
      const res = await fetch("/api/nieuws", { cache: "no-store" });
      const json: NieuwsAntwoord = await res.json();
      setNieuws(json);
    } catch {
      setNieuws({
        beschikbaar: false,
        items: [],
        bijgewerkt: null,
        opmerking: "Actueel nieuws is tijdelijk niet beschikbaar.",
      });
    } finally {
      setNieuwsLaden(false);
    }
  }

  const filterUitleg =
    weergave === "alle"
      ? `${formatteerAantal(waarnemingen.length)} thermische VIIRS-waarnemingen; dit zijn niet automatisch branden.`
      : weergave === "waarschijnlijk"
        ? `${formatteerAantal(waarschijnlijkeAantal)} van ${formatteerAantal(
            waarnemingen.length
          )} metingen voldoen aan conservatieve technische criteria. Niet officieel bevestigd.`
        : "Recente officiële FR-Alert-meldingen. FR-Alert wordt alleen bij ernstige situaties ingezet en is geen volledige brandenlijst.";

  return (
    <div className={styles.kaartEnNieuws}>
      <div className={styles.kaartContainer}>
        <div className={laagStyles.lagenFilter}>
          <span className={laagStyles.lagenTitel}>Kaartlaag</span>
          <div className={laagStyles.lagenKnoppen} role="group" aria-label="Kies de kaartlaag">
            <button
              type="button"
              aria-pressed={weergave === "alle"}
              onClick={() => kiesWeergave("alle")}
            >
              Alle hittebronnen
            </button>
            <button
              type="button"
              aria-pressed={weergave === "waarschijnlijk"}
              onClick={() => kiesWeergave("waarschijnlijk")}
            >
              Waarschijnlijke natuurbranden
            </button>
            <button
              type="button"
              aria-pressed={weergave === "officieel"}
              onClick={() => kiesWeergave("officieel")}
            >
              Officieel gemeld
            </button>
          </div>
          <p className={laagStyles.lagenUitleg}>{filterUitleg}</p>
        </div>

        {weergave === "officieel" && (
          <p className={laagStyles.officieelStatus} aria-live="polite">
            {frAlertLaden
              ? "Officiële FR-Alert-meldingen laden…"
              : frAlert?.beschikbaar
                ? frAlert.meldingen.length > 0
                  ? `${formatteerAantal(frAlert.meldingen.length)} recente officiële natuurbrandmelding${
                      frAlert.meldingen.length === 1 ? "" : "en"
                    } geografisch geplaatst.`
                  : frAlert.opmerking ?? "Geen recente officiële melding gevonden."
                : frAlert?.opmerking ?? "Officiële meldingen zijn tijdelijk niet beschikbaar."}
          </p>
        )}

        <div className={styles.kaartViewport}>
          <div className={styles.zoomBediening} role="group" aria-label="Kaart in- en uitzoomen">
            <button
              type="button"
              aria-label="Inzoomen"
              disabled={camera.zoom >= MAX_ZOOM}
              onClick={() => zoomNaar(camera.zoom * 1.7)}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Uitzoomen"
              disabled={camera.zoom <= MIN_ZOOM}
              onClick={() => zoomNaar(camera.zoom / 1.7)}
            >
              −
            </button>
            <button
              type="button"
              className={styles.zoomReset}
              disabled={camera.zoom === MIN_ZOOM}
              onClick={() => {
                setClusterSelectie(null);
                setGekozenMeldingId(null);
                setCamera({ x: kaartX, y: kaartY, zoom: MIN_ZOOM });
              }}
            >
              Heel Frankrijk
            </button>
          </div>

          <svg
            ref={svgRef}
            className={`kaart-vlak ${styles.zoomKaart}`}
            viewBox={`${camera.x} ${camera.y} ${zichtbareBreedte} ${zichtbareHoogte}`}
            role="group"
            aria-label={`Kaart van Frankrijk met bosbrandgevaar per departement en kaartlaag ${weergave}`}
            onWheel={(e) => {
              e.preventDefault();
              zoomNaar(camera.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              zoomNaar(camera.zoom * 1.8, e.clientX, e.clientY);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === "mouse") return;
              const punt = { x: e.clientX, y: e.clientY };
              pointersRef.current.set(e.pointerId, punt);
              startPuntRef.current = punt;
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
                    const zoom = begrens(huidigeCamera.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
                    const oudeBreedte = kaartBreedte / huidigeCamera.zoom;
                    const oudeHoogte = kaartHoogte / huidigeCamera.zoom;
                    const ankerX =
                      huidigeCamera.x + ((nieuwMidden.x - rect.left) / rect.width) * oudeBreedte;
                    const ankerY =
                      huidigeCamera.y + ((nieuwMidden.y - rect.top) / rect.height) * oudeHoogte;
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
                  setClusterSelectie(null);
                  setGekozenMeldingId(null);
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
                const start = startPuntRef.current;
                if (
                  start &&
                  Math.hypot(huidigPunt.x - start.x, huidigPunt.y - start.y) > SLEEPDREMPEL
                ) {
                  wasDraggingRef.current = true;
                  setClusterSelectie(null);
                  setGekozenMeldingId(null);
                }

                if (wasDraggingRef.current) {
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
                }
                gestureRef.current.laatsteMidden = huidigPunt;
              }
            }}
            onPointerUp={(e) => {
              pointersRef.current.delete(e.pointerId);
              startPuntRef.current = null;
              registreerPointers();
            }}
            onPointerLeave={(e) => {
              pointersRef.current.delete(e.pointerId);
              startPuntRef.current = null;
              registreerPointers();
            }}
            onPointerCancel={(e) => {
              pointersRef.current.delete(e.pointerId);
              startPuntRef.current = null;
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
                    if (!wasDraggingRef.current) onKies(pad.code);
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

            {markers.map((marker) => {
              if (marker.type === "cluster") {
                const schaal = (1 / camera.zoom).toFixed(4);
                const label = `${formatteerAantal(
                  marker.punten.length
                )} satellietmetingen in dit gebied. Klik om automatisch in te zoomen.`;
                return (
                  <g
                    key={marker.id}
                    className={clusterStyles.cluster}
                    transform={`translate(${marker.x.toFixed(1)} ${marker.y.toFixed(
                      1
                    )}) scale(${schaal})`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!wasDraggingRef.current) zoomNaarCluster(marker);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        zoomNaarCluster(marker);
                      }
                    }}
                  >
                    <title>{label}</title>
                    <circle className={clusterStyles.clusterHalo} r="25" />
                    <circle className={clusterStyles.clusterCore} r="20" />
                    <text
                      className={clusterStyles.clusterText}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {verkortAantal(marker.punten.length)}
                    </text>
                  </g>
                );
              }

              const waarneming = marker.punt.waarneming;
              const geselecteerd = gekozenWaarneming === waarneming.id;
              const label = `Satellietwaarneming in departement ${
                waarneming.departementCode
              }, betrouwbaarheid ${waarneming.betrouwbaarheid}, ${formatteerKorteDatum(
                waarneming.waargenomenOp
              )}`;
              return (
                <g
                  key={marker.id}
                  className={`${styles.mapPin}${
                    geselecteerd ? ` ${styles.mapPinSelected}` : ""
                  }`}
                  transform={`translate(${marker.x.toFixed(1)} ${marker.y.toFixed(
                    1
                  )}) scale(${(1 / camera.zoom).toFixed(4)})`}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={geselecteerd}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (wasDraggingRef.current) return;
                    setClusterSelectie(null);
                    onKiesWaarneming(waarneming.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setClusterSelectie(null);
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

            {weergave === "officieel" &&
              geprojecteerdeMeldingen.map(({ melding, x, y }) => {
                const geselecteerd = gekozenMeldingId === melding.id;
                const label = `Officiële natuurbrandmelding: ${melding.titel}, ${melding.locatie}, zekerheid ${melding.zekerheid}`;
                return (
                  <g
                    key={melding.id}
                    className={`${laagStyles.officieelMarker}${
                      geselecteerd ? ` ${laagStyles.officieelMarkerActief}` : ""
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
                      if (!wasDraggingRef.current) {
                        setClusterSelectie(null);
                        setGekozenMeldingId((huidig) => (huidig === melding.id ? null : melding.id));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setGekozenMeldingId((huidig) => (huidig === melding.id ? null : melding.id));
                      }
                    }}
                  >
                    <title>{label}</title>
                    <circle className={laagStyles.officieelHalo} r="25" />
                    <circle className={laagStyles.officieelCore} r="19" />
                    <path
                      className={laagStyles.officieelVlam}
                      d="M0 11C-7 8-10 3-8-3c1-4 4-6 5-10 4 3 7 7 6 12 2-2 3-4 3-6 5 5 6 13 1 17-2 1-4 2-7 1Z"
                    />
                  </g>
                );
              })}
          </svg>

          {clusterSelectie && (
            <div
              className={`${styles.pinPopup} ${popupPositieKlasse} ${clusterStyles.clusterPopup}`}
              style={{
                left: `${begrens(popupSchermX, 0, 100)}%`,
                top: `${begrens(popupSchermY, 0, 100)}%`,
              }}
              role="dialog"
              aria-modal="false"
              aria-labelledby="cluster-popup-titel"
            >
              <button
                type="button"
                className={styles.popupSluit}
                aria-label="Kaartje sluiten"
                onClick={() => setClusterSelectie(null)}
              >
                ×
              </button>
              <h3 id="cluster-popup-titel">
                {formatteerAantal(clusterSelectie.punten.length)} metingen in dit gebied
              </h3>
              <p className={clusterStyles.clusterPopupIntro}>
                Deze metingen liggen ook op het maximale zoomniveau dicht bij elkaar. Kies een
                tijdstip voor de afzonderlijke meetgegevens.
              </p>
              <ol className={clusterStyles.clusterMeetingen}>
                {[...clusterSelectie.punten]
                  .sort(
                    (a, b) =>
                      Date.parse(b.waarneming.waargenomenOp) -
                      Date.parse(a.waarneming.waargenomenOp)
                  )
                  .slice(0, 8)
                  .map((punt) => (
                    <li key={punt.waarneming.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setClusterSelectie(null);
                          onKiesWaarneming(punt.waarneming.id);
                        }}
                      >
                        <strong>{formatteerKorteDatum(punt.waarneming.waargenomenOp)}</strong>
                        <span>
                          {DEP_BY_CODE[punt.waarneming.departementCode]?.naam ??
                            `departement ${punt.waarneming.departementCode}`}
                          {punt.waarneming.frp !== null
                            ? ` · ${formatteerGetal(punt.waarneming.frp)} MW`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ol>
              {clusterSelectie.punten.length > 8 && (
                <p className={clusterStyles.clusterMeer}>
                  De acht meest recente metingen worden getoond.
                </p>
              )}
            </div>
          )}

          {!clusterSelectie && gekozenPunt && popupCoordinaat && (
            <div
              className={`${styles.pinPopup} ${popupPositieKlasse}`}
              style={{
                left: `${begrens(popupSchermX, 0, 100)}%`,
                top: `${begrens(popupSchermY, 0, 100)}%`,
              }}
              role="dialog"
              aria-modal="false"
              aria-labelledby="satelliet-popup-titel"
            >
              <button
                type="button"
                className={styles.popupSluit}
                aria-label="Kaartje sluiten"
                onClick={() => onKiesWaarneming(gekozenPunt.waarneming.id)}
              >
                ×
              </button>
              <h3 id="satelliet-popup-titel">
                Satellietwaarneming{" "}
                <span className="dep-code">{gekozenPunt.waarneming.departementCode}</span>
              </h3>
              <div className={styles.detailGrid}>
                <span className={styles.detailLabel}>Locatie</span>
                <span>
                  {DEP_BY_CODE[gekozenPunt.waarneming.departementCode]?.naam ??
                    `departement ${gekozenPunt.waarneming.departementCode}`}
                  <br />
                  {gekozenPunt.waarneming.latitude.toFixed(4)},{" "}
                  {gekozenPunt.waarneming.longitude.toFixed(4)}
                </span>
                <span className={styles.detailLabel}>Waargenomen</span>
                <span>{formatteerDatum(gekozenPunt.waarneming.waargenomenOp)}</span>
                <span className={styles.detailLabel}>Sensor</span>
                <span>
                  {gekozenPunt.waarneming.instrument} · {gekozenPunt.waarneming.satelliet}
                  {gekozenPunt.waarneming.dagNacht
                    ? ` · ${gekozenPunt.waarneming.dagNacht}`
                    : ""}
                </span>
                <span className={styles.detailLabel}>Betrouwbaarheid</span>
                <span>{gekozenPunt.waarneming.betrouwbaarheid}</span>
                {gekozenPunt.waarneming.frp !== null && (
                  <>
                    <span className={styles.detailLabel}>FRP</span>
                    <span>{formatteerGetal(gekozenPunt.waarneming.frp)} MW</span>
                  </>
                )}
              </div>
              <p className={laagStyles.technischeDuiding}>
                <strong>Technische duiding:</strong>{" "}
                {gekozenPunt.waarneming.waarschijnlijkNatuurbrand
                  ? "het patroon past bij een mogelijke natuurbrand"
                  : "de meting voldoet niet aan de conservatieve criteria voor een waarschijnlijke natuurbrand"}
                {gekozenPunt.waarneming.waarschijnlijkheidsRedenen.length > 0
                  ? `. Signalen: ${gekozenPunt.waarneming.waarschijnlijkheidsRedenen.join(
                      ", "
                    )}.`
                  : "."}
              </p>
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
                Technische waarschijnlijkheid is geen bevestiging. FRP is het geschatte
                uitgestraalde vermogen, niet het verbrande oppervlak.
              </p>
            </div>
          )}

          {!clusterSelectie && gekozenMelding && meldingCoordinaat && (
            <div
              className={`${styles.pinPopup} ${popupPositieKlasse} ${laagStyles.officieelPopup}`}
              style={{
                left: `${begrens(popupSchermX, 0, 100)}%`,
                top: `${begrens(popupSchermY, 0, 100)}%`,
              }}
              role="dialog"
              aria-modal="false"
              aria-labelledby="officieel-popup-titel"
            >
              <button
                type="button"
                className={styles.popupSluit}
                aria-label="Kaartje sluiten"
                onClick={() => setGekozenMeldingId(null)}
              >
                ×
              </button>
              <h3 id="officieel-popup-titel">Officieel gemelde natuurbrand</h3>
              <span className={laagStyles.officieelBadge}>
                {gekozenMelding.melding.actief ? "melding actief" : "melding beëindigd"}
              </span>
              <div className={styles.detailGrid}>
                <span className={styles.detailLabel}>Melding</span>
                <span>{gekozenMelding.melding.titel}</span>
                <span className={styles.detailLabel}>Locatie</span>
                <span>{gekozenMelding.melding.locatie}</span>
                <span className={styles.detailLabel}>Zekerheid</span>
                <span>{gekozenMelding.melding.zekerheid}</span>
                <span className={styles.detailLabel}>Bron</span>
                <span>{gekozenMelding.melding.bron}</span>
                {gekozenMelding.melding.begonnenOp && (
                  <>
                    <span className={styles.detailLabel}>Begonnen</span>
                    <span>{formatteerDatum(gekozenMelding.melding.begonnenOp)}</span>
                  </>
                )}
                {gekozenMelding.melding.eindigtOp && (
                  <>
                    <span className={styles.detailLabel}>Einde melding</span>
                    <span>{formatteerDatum(gekozenMelding.melding.eindigtOp)}</span>
                  </>
                )}
              </div>
              <a
                className={laagStyles.officieelLink}
                href={gekozenMelding.melding.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Bekijk de officiële FR-Alert-melding
              </a>
              <p className={styles.caveat}>
                FR-Alert wordt alleen bij ernstige situaties ingezet. Geen marker betekent dus niet
                dat er in dat gebied geen natuurbrand is.
              </p>
            </div>
          )}
        </div>

        <p className={styles.zoomUitleg}>
          Klik op een genummerde cirkel om automatisch naar dat gebied te zoomen. De kaart blijft
          binnen het kader. Handmatig zoomen en slepen blijft mogelijk.
        </p>

        <details className={clusterStyles.viirsUitleg}>
          <summary>
            Wat betekenen {formatteerAantal(waarnemingen.length)} VIIRS-detecties?
          </summary>
          <p>
            <strong>
              Dit zijn niet {formatteerAantal(waarnemingen.length)} afzonderlijke natuurbranden.
            </strong>{" "}
            VIIRS is een infraroodsensor op weersatellieten. Eén detectie markeert het middelpunt
            van een beeldpixel van ongeveer 375 × 375 meter waarin een hittebron of andere
            thermische afwijking is gemeten.
          </p>
          <p>
            Dezelfde brand kan tijdens verschillende satellietpassages meermaals worden gemeten.
            Ook landbouwvuren, industrie, hete rook of een andere warmtebron kunnen een detectie
            veroorzaken. De stand “Waarschijnlijke natuurbranden” gebruikt daarom een conservatieve
            combinatie van betrouwbaarheid, FRP en samenhangende metingen in tijd en ruimte. Dit
            blijft een technische inschatting.
          </p>
          <p>
            Bron:{" "}
            <a
              href="https://firms.modaps.eosdis.nasa.gov/map/"
              target="_blank"
              rel="noopener noreferrer"
            >
              NASA FIRMS
            </a>
          </p>
        </details>
      </div>

      <section
        className={`${styles.nieuwsBlok} ${clusterStyles.nieuwsCompact}`}
        aria-labelledby="actueel-nieuws-titel"
      >
        <div className={clusterStyles.nieuwsSamenvatting}>
          <div>
            <h3 id="actueel-nieuws-titel">Actueel nieuws over natuurbranden</h3>
            <p>Wordt pas geladen wanneer u het nieuwsblok opent.</p>
          </div>
          <button
            type="button"
            className={clusterStyles.nieuwsToggle}
            aria-expanded={nieuwsOpen}
            onClick={wisselNieuws}
          >
            {nieuwsOpen ? "Nieuws sluiten" : "Laatste nieuws tonen"}
          </button>
        </div>

        {nieuwsOpen && (
          <div className={clusterStyles.nieuwsInhoud}>
            <a
              className={styles.officieleLink}
              href="https://fr-alert.gouv.fr/les-alertes"
              target="_blank"
              rel="noopener noreferrer"
            >
              Officiële FR-Alert-waarschuwingen
            </a>
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
          </div>
        )}
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

function verkortAantal(aantal: number): string {
  if (aantal < 1000) return String(aantal);
  return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(
    aantal / 1000
  )}k`;
}

function formatteerAantal(aantal: number): string {
  return new Intl.NumberFormat("nl-NL").format(aantal);
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
