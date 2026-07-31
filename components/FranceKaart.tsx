"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DEP_BY_CODE } from "@/lib/departements";
import { KAART_PADEN, KAART_VIEWBOX } from "@/lib/kaart-paths";
import { projecteerCoordinaat } from "@/lib/kaart-projectie";
import { kaartBboxVoorCodes } from "@/lib/departement-bbox";
import { niveauVoor, GEEN_DATA_KLEUR } from "@/lib/niveaus";
import { isNuActueel, type FrAlertAntwoord, type FrAlertMelding } from "@/lib/fr-alert";
import type { Waarneming } from "@/lib/waarnemingen";
import type { Niveaus } from "@/components/Tool";
import NiveauBlok from "@/components/NiveauBlok";
import InfoKnop from "@/components/InfoKnop";
import { LegUit } from "@/components/LegUit";
import { UITLEG } from "@/data/uitleg";
import styles from "@/components/Waarnemingen.module.css";
import clusterStyles from "@/components/KaartClusters.module.css";
import laagStyles from "@/components/BrandLagen.module.css";

const MIN_ZOOM = 1;
// Klik op een cluster opent nu direct de lijst; er wordt niet meer automatisch
// diep ingezoomd. Drie handmatige zoomstappen (×1,7) volstaan: 1 → 1,7 → 2,9 → 5.
const MAX_ZOOM = 5;
const SLEEPDREMPEL = 6;
// Extra tekenruimte rond de kaartvormen (in kaarteenheden), zodat de genummerde
// bollen en druppelpins op de uiterste noord-, zuid-, oost- en westrand volledig
// zichtbaar blijven — de grootste marker (clusterhalo r=25) plus ruim lucht.
// Symmetrisch gehouden met opzet: in de postcode-zoom valt de marge weg
// (zichtbare breedte = kaartBreedte/zoom = departementbreedte + padding), dus een
// symmetrische marge verandert die zoom visueel niet; een noord-only marge zou
// wél kunnen bepalen welke dimensie de fit begrenst. Ruimer dan de eerdere 34,
// want de bovenste pins rond Duinkerken werden nog net afgeknipt.
const KAART_MARGE = 52;
// Wielzoom-demping: één muiswieltik (deltaY≈100) geeft ongeveer ×1,05; kleine
// trackpad-stapjes tellen vanzelf multiplicatief op tot een vloeiende beweging.
const WIEL_DEMPING = 0.000488;

type Weergave = "warmte" | "officieel";

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface SchermPunt {
  x: number;
  y: number;
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
  beginWeergave,
  onVraagWaarnemingen,
  zoomNaarDeps,
}: {
  niveaus: Niveaus;
  echeance: "j1" | "j2";
  gekozen: string | null;
  onKies: (code: string) => void;
  waarnemingen: Waarneming[];
  toonWaarnemingen: boolean;
  gekozenWaarneming: string | null;
  onKiesWaarneming: (id: string) => void;
  // Beginlaag (uit de deep-link), expliciet op laagsleutel i.p.v. DOM-klik.
  beginWeergave?: Weergave;
  // Vraag de ouder de satellietwaarnemingen aan te zetten (checkbox volgt de laag).
  onVraagWaarnemingen?: () => void;
  // Departementcode(s) waar de camera na een geslaagde postcode-zoek naartoe
  // springt (C2). Elke nieuwe zoekopdracht krijgt een verse array-referentie,
  // ook bij dezelfde code, zodat opnieuw zoeken opnieuw inzoomt.
  zoomNaarDeps?: string[] | null;
}) {
  const [rawX, rawY, rawBreedte, rawHoogte] = KAART_VIEWBOX.split(" ").map(Number);
  // De camerawereld is de kaart plús een marge rondom (E): zo valt geen enkele
  // markering op de buitenrand weg, ook niet na inzoomen (begrensCamera klemt
  // binnen deze ruimere grenzen).
  const kaartX = rawX - KAART_MARGE;
  const kaartY = rawY - KAART_MARGE;
  const kaartBreedte = rawBreedte + 2 * KAART_MARGE;
  const kaartHoogte = rawHoogte + 2 * KAART_MARGE;
  const [camera, setCamera] = useState<Camera>({ x: kaartX, y: kaartY, zoom: MIN_ZOOM });
  const [clusterSelectie, setClusterSelectie] = useState<ClusterSelectie | null>(null);
  const [weergave, setWeergave] = useState<Weergave>(beginWeergave ?? "warmte");
  // Wielzoom is pas actief nadat de bezoeker de kaart heeft aangeklikt (D2), en
  // gaat weer uit zodra de muis de kaart verlaat. Ctrl/Cmd omzeilt dit (D3).
  const [zoomActief, setZoomActief] = useState(false);
  const [frAlert, setFrAlert] = useState<FrAlertAntwoord | null>(null);
  const [frAlertLaden, setFrAlertLaden] = useState(false);
  const [gekozenMeldingId, setGekozenMeldingId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(null);
  const pointersRef = useRef(new Map<number, SchermPunt>());
  const gestureRef = useRef<{
    laatsteMidden: SchermPunt | null;
    laatsteAfstand: number | null;
  }>({ laatsteMidden: null, laatsteAfstand: null });
  const wasDraggingRef = useRef(false);
  const startPuntRef = useRef<SchermPunt | null>(null);
  // Zoomkader (shift-slepen met de muis): startpunt en het getekende kader.
  const boxZoomRef = useRef<SchermPunt | null>(null);
  const [zoomKader, setZoomKader] = useState<
    { left: number; top: number; breedte: number; hoogte: number } | null
  >(null);

  // De kaartlaag wordt nu bovenaan de kaart (in Tool) gekozen en via
  // beginWeergave doorgegeven. Volg die keuze en ruim vluchtige selecties op,
  // zodat een laagwissel geen verweesde popup of clusterselectie laat staan.
  useEffect(() => {
    if (!beginWeergave) return;
    setWeergave(beginWeergave);
    setClusterSelectie(null);
    setGekozenMeldingId(null);
  }, [beginWeergave]);

  // C2: spring naar de omhullende van het (de) gezochte departement(en). Elke
  // nieuwe zoekopdracht levert een verse array, dus dezelfde postcode zoomt
  // opnieuw in; "Heel Frankrijk" (de resetknop) is de zichtbare weg terug.
  useEffect(() => {
    if (!zoomNaarDeps || zoomNaarDeps.length === 0) return;
    const b = kaartBboxVoorCodes(zoomNaarDeps);
    if (!b) return;
    setClusterSelectie(null);
    setGekozenMeldingId(null);
    const bw = b.maxX - b.minX + KAART_MARGE * 2;
    const bh = b.maxY - b.minY + KAART_MARGE * 2;
    const zoom = begrens(Math.min(kaartBreedte / bw, kaartHoogte / bh), MIN_ZOOM, MAX_ZOOM);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    setCamera(
      begrensCamera({
        zoom,
        x: cx - kaartBreedte / zoom / 2,
        y: cy - kaartHoogte / zoom / 2,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomNaarDeps]);

  // Sluit de open kaartpopup. Werkt voor cluster, waarneming, melding én
  // departement — de ouder toggelt de laatste twee via onKiesWaarneming/onKies.
  const sluitPopups = () => {
    setClusterSelectie(null);
    setGekozenMeldingId(null);
    if (gekozenWaarneming) onKiesWaarneming(gekozenWaarneming);
    if (gekozen) onKies(gekozen);
  };

  useEffect(() => {
    if (weergave !== "officieel" || frAlert) return;
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
            liveBron: false,
            momentopnameVan: null,
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
  }, [weergave, frAlert]);

  const zichtbareBreedte = kaartBreedte / camera.zoom;
  const zichtbareHoogte = kaartHoogte / camera.zoom;
  const gefilterdeWaarnemingen = useMemo(() => {
    if (weergave === "officieel") return [];
    // Warmtebronnen toont álle metingen; het clusterdeel is alleen nog een
    // aanduiding (B), niet meer een aparte, filterende laag.
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

  const alleMeldingen = frAlert?.meldingen ?? [];
  // FR-Alert publiceert op de website met vertraging; er is dus altijd een
  // "laatste" stand. We tonen de meest recente meldingen (loopend én beëindigd),
  // met de status bij elk item, in plaats van een misleidende "geen actuele
  // melding". Meldingen komen nieuwste-eerst uit de route.
  const laatsteMeldingen = alleMeldingen.slice(0, 8);
  const laatstGepubliceerd = alleMeldingen[0]?.begonnenOp ?? null;

  const geprojecteerdeMeldingen = useMemo<GeprojecteerdeMelding[]>(() => {
    return laatsteMeldingen.map((melding) => {
      const { x, y } = projecteerCoordinaat(melding.longitude, melding.latitude);
      return { melding, x, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alleMeldingen]);

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

  // Zwaartepunt van het gekozen departement in kaartcoördinaten; anker voor de
  // departement-popup (werkt ook bij toetsenbordselectie, zonder klikpositie).
  const depCentroid = useMemo(() => {
    if (!gekozen) return null;
    const pad = KAART_PADEN.find((p) => p.code === gekozen);
    return pad ? zwaartepuntVanPad(pad.d) : null;
  }, [gekozen]);

  const popupCoordinaat = gekozenPunt ? { x: gekozenPunt.x, y: gekozenPunt.y } : null;
  const meldingCoordinaat = gekozenMelding ? { x: gekozenMelding.x, y: gekozenMelding.y } : null;
  const gekozenDepInfo = gekozen ? DEP_BY_CODE[gekozen] ?? null : null;
  const depCoordinaat = gekozenDepInfo && depCentroid ? depCentroid : null;
  const actievePopupCoordinaat =
    clusterSelectie ?? meldingCoordinaat ?? popupCoordinaat ?? depCoordinaat;

  // Sleutel die verandert zodra er een andere popup (of andere inhoud) opent, zodat
  // de plaatsing opnieuw wordt gemeten wanneer de afmetingen kunnen wijzigen.
  const popupSleutel = clusterSelectie
    ? `cluster-${clusterSelectie.punten.length}-${clusterSelectie.x.toFixed(1)}`
    : gekozenMelding
      ? `melding-${gekozenMelding.melding.id}`
      : gekozenPunt
        ? `pin-${gekozenPunt.waarneming.id}`
        : depCoordinaat
          ? `dep-${gekozen}`
          : null;
  const coordX = actievePopupCoordinaat?.x ?? null;
  const coordY = actievePopupCoordinaat?.y ?? null;

  // Plaats de popup in pixels en klem op de EIGEN afmetingen, zodat hij altijd
  // volledig binnen het kaartvlak blijft en nooit onder de vaste zijladerail
  // schuift. Meten gebeurt vóór de paint (useLayoutEffect), dus zonder flikkering.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const pop = popupRef.current;
    if (!vp || !pop || coordX === null || coordY === null) {
      setPopupPos(null);
      return;
    }
    const plaats = () => {
      const vpRect = vp.getBoundingClientRect();
      const pinX = ((coordX - camera.x) / zichtbareBreedte) * vpRect.width;
      const pinY = ((coordY - camera.y) / zichtbareHoogte) * vpRect.height;
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      const marge = 8;
      // De vaste zijladerail (rechts, buiten de kaart) mag de popup nooit bedekken.
      // Op smalle vensters is de rail breder; onder 560px staat de popup statisch.
      const railBreedte = window.innerWidth <= 700 ? 78 : 46;
      const linksMaxDoorRail =
        window.innerWidth - railBreedte - marge - pw - vpRect.left;
      const linksMax = Math.max(marge, Math.min(vpRect.width - pw - marge, linksMaxDoorRail));
      let left = pinX + 18;
      if (left + pw > linksMax) left = pinX - 18 - pw;
      left = Math.min(Math.max(left, marge), linksMax);
      let top = pinY + 18;
      if (top + ph > vpRect.height - marge) top = pinY - 18 - ph;
      top = Math.min(Math.max(top, marge), Math.max(marge, vpRect.height - ph - marge));
      // Zoomknoppen (linksboven in het kaartvlak) altijd vrijhouden.
      const zoom = vp.querySelector('[aria-label="Kaart in- en uitzoomen"]');
      if (zoom) {
        const zr = zoom.getBoundingClientRect();
        const zRight = zr.right - vpRect.left + marge;
        const zBottom = zr.bottom - vpRect.top + marge;
        if (left < zRight && top < zBottom) {
          if (zRight + pw <= linksMax) left = zRight;
          else top = Math.min(Math.max(zBottom, marge), Math.max(marge, vpRect.height - ph - marge));
        }
      }
      setPopupPos({ left, top });
    };
    plaats();
    window.addEventListener("resize", plaats);
    return () => window.removeEventListener("resize", plaats);
  }, [popupSleutel, coordX, coordY, camera.x, camera.y, zichtbareBreedte, zichtbareHoogte]);

  const popupStijl: CSSProperties = {
    left: popupPos ? `${popupPos.left}px` : 0,
    top: popupPos ? `${popupPos.top}px` : 0,
    visibility: popupPos ? "visible" : "hidden",
  };

  // Escape sluit de open popup (klik-ernaast gaat via de SVG-achtergrond, onder).
  const popupOpen = !!(clusterSelectie || gekozenMelding || gekozenPunt || gekozenDepInfo);
  useEffect(() => {
    if (!popupOpen) return;
    const opEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") sluitPopups();
    };
    window.addEventListener("keydown", opEsc);
    return () => window.removeEventListener("keydown", opEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupOpen]);

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

  // Verse verwijzingen voor de native wielhandler (die één keer bij mount wordt
  // gehecht en anders met verouderde waarden zou werken).
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const zoomActiefRef = useRef(zoomActief);
  zoomActiefRef.current = zoomActief;
  const zoomNaarRef = useRef<(z: number, x?: number, y?: number) => void>(() => {});
  zoomNaarRef.current = zoomNaar; // zoomNaar is een gehoiste functiedeclaratie

  // Wielgedrag als in de rookmodule (D): standaard scrolt het wiel de PAGINA.
  // Zoomen gebeurt alleen ná een klik op de kaart, of meteen met Ctrl/Cmd. De
  // stap is gedempt en telt multiplicatief op, zodat een trackpad-veeg niet
  // springt. Een eigen niet-passieve listener is nodig omdat React onWheel
  // passief hecht (preventDefault zou dan genegeerd worden).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const opWiel = (e: WheelEvent) => {
      const forceer = e.ctrlKey || e.metaKey;
      if (!forceer && !zoomActiefRef.current) return; // pagina scrollt (D1)
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * WIEL_DEMPING);
      zoomNaarRef.current(cameraRef.current.zoom * factor, e.clientX, e.clientY);
    };
    svg.addEventListener("wheel", opWiel, { passive: false });
    return () => svg.removeEventListener("wheel", opWiel);
  }, []);

  // Zoom naar een met shift-slepen getekend kader (in pixels t.o.v. het svg-vlak).
  function zoomNaarKader(
    bx0: number,
    by0: number,
    bw: number,
    bh: number,
    rect: DOMRect
  ) {
    if (bw <= 0 || bh <= 0) return;
    setClusterSelectie(null);
    setGekozenMeldingId(null);
    setCamera((huidig) => {
      const zbBreedte = kaartBreedte / huidig.zoom;
      const zbHoogte = kaartHoogte / huidig.zoom;
      const mw = (bw / rect.width) * zbBreedte;
      const mh = (bh / rect.height) * zbHoogte;
      const mcx = huidig.x + ((bx0 + bw / 2) / rect.width) * zbBreedte;
      const mcy = huidig.y + ((by0 + bh / 2) / rect.height) * zbHoogte;
      const zoom = begrens(
        Math.min(kaartBreedte / mw, kaartHoogte / mh),
        MIN_ZOOM,
        MAX_ZOOM
      );
      const nb = kaartBreedte / zoom;
      const nh = kaartHoogte / zoom;
      return begrensCamera({ zoom, x: mcx - nb / 2, y: mcy - nh / 2 });
    });
  }

  function opClusterGeklikt(cluster: ClusterMarker) {
    // Eén klik opent direct de lijst met metingen — geen automatische zoom, geen
    // camerasprong. Zoomen blijft handmatig via de knoppen en slepen.
    if (gekozenWaarneming) onKiesWaarneming(gekozenWaarneming);
    setClusterSelectie({ x: cluster.x, y: cluster.y, punten: cluster.punten });
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

  // In-kaart-melding zodat geen enkele laag stil leeg blijft (D2).
  const satellietUit = weergave !== "officieel" && !toonWaarnemingen;
  const geenHittebronnen =
    weergave !== "officieel" && toonWaarnemingen && waarnemingen.length === 0;
  const geenMeldingen =
    weergave === "officieel" &&
    !frAlertLaden &&
    !!frAlert?.beschikbaar &&
    laatsteMeldingen.length === 0;

  return (
    <div className={styles.kaartEnNieuws}>
      <div className={styles.kaartContainer}>
        {weergave === "officieel" && (
          <>
            {!frAlertLaden && frAlert && !frAlert.liveBron && frAlert.meldingen.length > 0 && (
              <p className={laagStyles.momentopnameBanner} role="status">
                <strong>Let op — geen live gegevens.</strong> De live FR-Alert-pagina is
                nu niet uitleesbaar. Hieronder staat de laatst bekende officiële stand
                {frAlert.momentopnameVan
                  ? ` van ${formatteerDatum(frAlert.momentopnameVan)}`
                  : ""}
                , dus niet de actuele situatie.
              </p>
            )}
            <p className={laagStyles.officieelStatus} aria-live="polite">
              {frAlertLaden
                ? "Officiële FR-Alert-meldingen laden…"
                : frAlert?.beschikbaar
                  ? laatstGepubliceerd
                    ? `FR-Alert publiceert met vertraging en is geen actuele brandenlijst. Laatst gepubliceerde melding: ${formatteerDatum(laatstGepubliceerd)}.`
                    : "FR-Alert publiceert met vertraging en is geen actuele brandenlijst."
                  : frAlert?.opmerking ?? "Officiële meldingen zijn tijdelijk niet beschikbaar."}
            </p>
          </>
        )}

        <div
          className={styles.kaartViewport}
          ref={viewportRef}
          onMouseLeave={() => setZoomActief(false)}
        >
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
            onClick={(e) => {
              // Een klik op de kaart zet wielzoom aan (D2).
              setZoomActief(true);
              // Klik náást een departement/pin (op de lege SVG-achtergrond) sluit
              // een open popup; een klik op een pad/pin heeft e.target ≠ de svg.
              if (e.target === e.currentTarget && !wasDraggingRef.current) sluitPopups();
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              zoomNaar(camera.zoom * 1.8, e.clientX, e.clientY);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === "mouse") return;
              // Shift-slepen met de muis opent een zoomkader; de gewone pan/pinch
              // loopt dan niet mee (deze pointer komt niet in pointersRef).
              if (e.pointerType === "mouse" && e.shiftKey) {
                e.preventDefault();
                boxZoomRef.current = { x: e.clientX, y: e.clientY };
                setZoomKader(null);
                wasDraggingRef.current = false;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                return;
              }
              const punt = { x: e.clientX, y: e.clientY };
              pointersRef.current.set(e.pointerId, punt);
              startPuntRef.current = punt;
              wasDraggingRef.current = false;
              registreerPointers();
            }}
            onPointerMove={(e) => {
              // Bezig met een zoomkader: teken het en sla de pan-logica over.
              if (boxZoomRef.current) {
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                const s = boxZoomRef.current;
                setZoomKader({
                  left: Math.min(s.x, e.clientX) - rect.left,
                  top: Math.min(s.y, e.clientY) - rect.top,
                  breedte: Math.abs(e.clientX - s.x),
                  hoogte: Math.abs(e.clientY - s.y),
                });
                return;
              }
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
              // Zoomkader afronden: naar het getekende gebied zoomen.
              if (boxZoomRef.current) {
                const start = boxZoomRef.current;
                boxZoomRef.current = null;
                setZoomKader(null);
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                const rect = svgRef.current?.getBoundingClientRect();
                if (rect) {
                  const bx0 = Math.min(start.x, e.clientX) - rect.left;
                  const by0 = Math.min(start.y, e.clientY) - rect.top;
                  const bw = Math.abs(e.clientX - start.x);
                  const bh = Math.abs(e.clientY - start.y);
                  // Minimale sleepafstand, anders is het eerder een klik.
                  if (bw > 12 && bh > 12) {
                    // Voorkom dat de navolgende click de popup sluit.
                    wasDraggingRef.current = true;
                    zoomNaarKader(bx0, by0, bw, bh, rect);
                  }
                }
                return;
              }
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
              if (boxZoomRef.current) {
                boxZoomRef.current = null;
                setZoomKader(null);
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                return;
              }
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
                    if (wasDraggingRef.current) return;
                    setClusterSelectie(null);
                    setGekozenMeldingId(null);
                    onKies(pad.code);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setClusterSelectie(null);
                      setGekozenMeldingId(null);
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
                )} satellietmetingen in dit gebied. Klik voor de lijst met metingen.`;
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
                      if (!wasDraggingRef.current) opClusterGeklikt(marker);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        opClusterGeklikt(marker);
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
              }, betrouwbaarheid ${betrouwbaarheidLabel(
                waarneming.betrouwbaarheid
              )}, ${formatteerKorteDatum(waarneming.waargenomenOp)}`;
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
                    }${isNuActueel(melding) ? "" : ` ${laagStyles.officieelMarkerAfgelopen}`}`}
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

          {zoomKader && zoomKader.breedte > 2 && zoomKader.hoogte > 2 && (
            <div
              className={styles.zoomKader}
              style={{
                left: `${zoomKader.left}px`,
                top: `${zoomKader.top}px`,
                width: `${zoomKader.breedte}px`,
                height: `${zoomKader.hoogte}px`,
              }}
              aria-hidden="true"
            />
          )}

          {(satellietUit || geenHittebronnen || geenMeldingen) && (
            <div className={styles.laagMelding} role="status">
              {satellietUit ? (
                <>
                  <span>Satellietwaarnemingen staan uit voor deze laag.</span>
                  <button type="button" onClick={() => onVraagWaarnemingen?.()}>
                    Aanzetten
                  </button>
                </>
              ) : geenHittebronnen ? (
                <span>Geen satellietdetecties boven Frankrijk in de afgelopen 24 uur.</span>
              ) : (
                <span>Geen officiële FR-Alert-meldingen op dit moment.</span>
              )}
            </div>
          )}

          {clusterSelectie && (
            <div
              ref={popupRef}
              className={`${styles.pinPopup} ${clusterStyles.clusterPopup}`}
              style={popupStijl}
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
                Op deze plek zijn in de afgelopen 24 uur{" "}
                {formatteerAantal(clusterSelectie.punten.length)} warmtemetingen gedaan. Klik
                een meting aan voor de details.
              </p>
              <div className={clusterStyles.clusterKolomKop} aria-hidden="true">
                <span>tijdstip</span>
                <span>departement · gemeten vermogen</span>
              </div>
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
              <LegUit
                meting={{
                  soort: "cluster",
                  id:
                    "cluster-" +
                    clusterSelectie.punten
                      .map((p) => p.waarneming.id)
                      .sort()
                      .join("_"),
                  aantal: clusterSelectie.punten.length,
                  departementCode: clusterSelectie.punten[0]?.waarneming.departementCode,
                  // Tijdstip van de JONGSTE meting in het cluster en de som van de
                  // bekende FRP-waarden — dezelfde velden die de popup al toont, zodat
                  // de "Leg uit" niet zelf een datum of vermogen hoeft te verzinnen (fix 1).
                  waargenomenOp: clusterSelectie.punten
                    .map((p) => p.waarneming.waargenomenOp)
                    .filter((d): d is string => typeof d === "string" && d.length > 0)
                    .sort()
                    .at(-1),
                  frp: clusterSelectie.punten.some((p) => p.waarneming.frp != null)
                    ? Math.round(
                        clusterSelectie.punten.reduce(
                          (s, p) => s + (p.waarneming.frp ?? 0),
                          0
                        ) * 10
                      ) / 10
                    : null,
                }}
              />
              <button
                type="button"
                className={styles.popupSluitOnder}
                onClick={() => setClusterSelectie(null)}
              >
                Sluiten
              </button>
            </div>
          )}

          {!clusterSelectie && gekozenPunt && popupCoordinaat && (
            <div
              ref={popupRef}
              className={styles.pinPopup}
              style={popupStijl}
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
              <h3 id="satelliet-popup-titel">Satellietwaarneming</h3>
              <div className={styles.detailGrid}>
                <span className={styles.detailLabel}>Locatie</span>
                <span>
                  {DEP_BY_CODE[gekozenPunt.waarneming.departementCode]?.naam ??
                    `departement ${gekozenPunt.waarneming.departementCode}`}
                  <span className={styles.coordRegel}>
                    coördinaten {gekozenPunt.waarneming.latitude.toFixed(4)},{" "}
                    {gekozenPunt.waarneming.longitude.toFixed(4)}
                  </span>
                </span>
                <span className={styles.detailLabel}>Waargenomen</span>
                <span>{formatteerDatum(gekozenPunt.waarneming.waargenomenOp)}</span>
                <span className={styles.detailLabel}>Sensor</span>
                <span>
                  {gekozenPunt.waarneming.instrument}
                  <InfoKnop kop={UITLEG.viirs.kop} tekst={UITLEG.viirs.tekst} />
                  {" · "}
                  {gekozenPunt.waarneming.satelliet}
                  {gekozenPunt.waarneming.dagNacht
                    ? ` · ${gekozenPunt.waarneming.dagNacht}`
                    : ""}
                </span>
                <span className={styles.detailLabel}>Betrouwbaarheid</span>
                <span>
                  {betrouwbaarheidLabel(gekozenPunt.waarneming.betrouwbaarheid)}
                  <InfoKnop
                    kop={UITLEG.betrouwbaarheid.kop}
                    tekst={UITLEG.betrouwbaarheid.tekst}
                  />
                </span>
                {gekozenPunt.waarneming.frp !== null && (
                  <>
                    <span className={styles.detailLabel}>Sterkte van de warmtebron (FRP)</span>
                    <span>
                      {formatteerGetal(gekozenPunt.waarneming.frp)} MW
                      <InfoKnop kop={UITLEG.frp.kop} tekst={UITLEG.frp.tekst} />
                      <span className={styles.schaalReferentie}>
                        ter vergelijking: een grote bosbrand geeft honderden tot meer dan
                        duizend MW
                      </span>
                    </span>
                  </>
                )}
              </div>
              <div className={laagStyles.technischeDuiding}>
                <p className={laagStyles.duidingConclusie}>
                  {gekozenPunt.waarneming.waarschijnlijkNatuurbrand ? (
                    <>
                      Deze meting hoort bij een groep metingen
                      <InfoKnop kop={UITLEG.cluster.kop} tekst={UITLEG.cluster.tekst} /> die
                      dicht bij elkaar en kort na elkaar zijn gedaan. Dat past bij een brand
                      die enige tijd doorbrandt — maar het kan ook een fabriek of gasfakkel
                      zijn.
                    </>
                  ) : (
                    "Dit is een losse meting. Die past minder bij een doorbrandende natuurbrand en komt vaak van landbouw, industrie of een korte hitte-uitschieter."
                  )}
                </p>
                <p className={laagStyles.technischKop}>Technisch</p>
                <p className={laagStyles.technischDetail}>
                  {gekozenPunt.waarneming.waarschijnlijkNatuurbrand
                    ? "Deze meting hoort bij een ruimtelijk en in tijd samenhangend cluster"
                    : "Deze meting hoort niet bij een samenhangend cluster"}
                  {gekozenPunt.waarneming.waarschijnlijkheidsRedenen.length > 0
                    ? `. Signalen: ${gekozenPunt.waarneming.waarschijnlijkheidsRedenen.join(
                        ", "
                      )}.`
                    : "."}
                </p>
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
                Een cluster is geen bevestigde natuurbrand: de filter maakt geen onderscheid
                tussen vegetatiebranden en vaste industriële warmtebronnen. FRP is het
                geschatte uitgestraalde vermogen, niet het verbrande oppervlak.
              </p>
              <LegUit
                meting={{
                  soort: "detectie",
                  id: gekozenPunt.waarneming.id,
                  departementCode: gekozenPunt.waarneming.departementCode,
                  frp: gekozenPunt.waarneming.frp,
                  betrouwbaarheid: gekozenPunt.waarneming.betrouwbaarheid,
                  cluster: gekozenPunt.waarneming.waarschijnlijkNatuurbrand,
                  waargenomenOp: gekozenPunt.waarneming.waargenomenOp,
                }}
              />
              <button
                type="button"
                className={styles.popupSluitOnder}
                onClick={() => onKiesWaarneming(gekozenPunt.waarneming.id)}
              >
                Sluiten
              </button>
            </div>
          )}

          {!clusterSelectie && gekozenMelding && meldingCoordinaat && (
            <div
              ref={popupRef}
              className={`${styles.pinPopup} ${laagStyles.officieelPopup}`}
              style={popupStijl}
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
              <span
                className={`${laagStyles.officieelBadge}${
                  isNuActueel(gekozenMelding.melding) ? "" : ` ${laagStyles.officieelBadgeAfgelopen}`
                }`}
              >
                {isNuActueel(gekozenMelding.melding)
                  ? "loopt"
                  : gekozenMelding.melding.eindigtOp
                    ? `beëindigd op ${formatteerDatum(gekozenMelding.melding.eindigtOp)}`
                    : "beëindigd"}
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
              <button
                type="button"
                className={styles.popupSluitOnder}
                onClick={() => setGekozenMeldingId(null)}
              >
                Sluiten
              </button>
            </div>
          )}

          {!clusterSelectie && !gekozenPunt && !gekozenMelding && gekozenDepInfo && (
            <div
              ref={popupRef}
              className={styles.pinPopup}
              style={popupStijl}
              role="dialog"
              aria-modal="false"
              aria-labelledby="dep-popup-titel"
            >
              <button
                type="button"
                className={styles.popupSluit}
                aria-label="Kaartje sluiten"
                onClick={() => onKies(gekozenDepInfo.code)}
              >
                ×
              </button>
              <h3 id="dep-popup-titel">
                {gekozenDepInfo.naam}{" "}
                <span className="dep-code">{gekozenDepInfo.code}</span>
              </h3>
              <div className="niveau-rij">
                <NiveauBlok dag="Morgen (J+1)" waarde={niveaus[gekozenDepInfo.code]?.j1 ?? null} />
                <NiveauBlok
                  dag="Overmorgen (J+2)"
                  waarde={niveaus[gekozenDepInfo.code]?.j2 ?? null}
                />
              </div>
              {niveauVoor(niveaus[gekozenDepInfo.code]?.[echeance] ?? null) && (
                <p className="niveau-toelichting">
                  {niveauVoor(niveaus[gekozenDepInfo.code]?.[echeance] ?? null)?.toelichting}
                </p>
              )}
              <p className={styles.popupBron}>
                <a href={gekozenDepInfo.prefectuurUrl} target="_blank" rel="noopener noreferrer">
                  Naar de prefectuur van {gekozenDepInfo.naam}
                </a>
              </p>
              <button
                type="button"
                className={styles.popupSluitOnder}
                onClick={() => onKies(gekozenDepInfo.code)}
              >
                Sluiten
              </button>
            </div>
          )}
        </div>

        <p className={styles.zoomUitleg}>
          Klik op een genummerde cirkel voor de lijst met metingen in dat gebied. Het muiswiel
          scrolt gewoon de pagina; pas ná een klik op de kaart zoomt het wiel in en uit (of houd
          Ctrl/Cmd ingedrukt). Zoomen kan ook met de plus- en minknop, met dubbelklik, of door met
          shift een zoomkader te slepen; pannen door te slepen. De kaart blijft binnen het kader.
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
            veroorzaken. Metingen die op samenhang en signaalsterkte een cluster vormen, worden
            per meting in de popup aangegeven, maar zo'n cluster maakt geen onderscheid tussen
            vegetatiebranden en vaste industriële warmtebronnen. Een cluster is dus geen
            bevestigde natuurbrand, maar een technische inschatting.
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
    </div>
  );
}

function begrens(waarde: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, waarde));
}

// Zwaartepunt (gemiddelde van de padpunten) in kaartcoördinaten. De paden gebruiken
// alleen M/L/Z met absolute x y-paren, exact de viewBox-ruimte van de camera.
function zwaartepuntVanPad(d: string): { x: number; y: number } | null {
  const getallen = d.match(/-?\d+(?:\.\d+)?/g);
  if (!getallen || getallen.length < 2) return null;
  let somX = 0;
  let somY = 0;
  let n = 0;
  for (let i = 0; i + 1 < getallen.length; i += 2) {
    somX += Number(getallen[i]);
    somY += Number(getallen[i + 1]);
    n += 1;
  }
  return n > 0 ? { x: somX / n, y: somY / n } : null;
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

function formatteerGetal(waarde: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(waarde);
}

// Vertaalt de NASA-betrouwbaarheidsklasse naar gewone taal met de oorspronkelijke
// term erachter. De datastroom levert alleen "hoog" en "nominaal" (lage metingen
// worden al bij het inlezen weggefilterd); "laag" staat er voor de volledigheid.
function betrouwbaarheidLabel(betrouwbaarheid: string): string {
  switch (betrouwbaarheid) {
    case "hoog":
      return "hoog (high)";
    case "nominaal":
      return "standaard (nominal)";
    case "laag":
      return "laag (low)";
    default:
      return betrouwbaarheid;
  }
}
