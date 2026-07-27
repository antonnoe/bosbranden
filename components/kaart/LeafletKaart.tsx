"use client";

// Generieke Leaflet-kaartschil. Bevat géén rook-, brand- of FIRMS-specifieke
// logica: alleen initialisatie, opruimen, resize, de gedempte basiskaart, de
// departementsgrenzen, de begrenzing op Frankrijk en (optioneel) coöperatieve
// gebaren voor embed. De datalagen komen van buitenaf: de ouder krijgt via
// onKaart de kaart en de Leaflet-module en beheert daarmee zijn eigen lagen.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import styles from "@/components/kaart/LeafletKaart.module.css";
import type * as LeafletType from "leaflet";

export type LeafletModule = typeof LeafletType;
export type LeafletKaartInstantie = LeafletType.Map;

// Frankrijk métropole inclusief Corsica (de bbox van de tool). Strak, zodat je
// niet in Spanje of op zee belandt.
const FRANKRIJK_ZUIDWEST: [number, number] = [41.33, -5.15];
const FRANKRIJK_NOORDOOST: [number, number] = [51.09, 9.56];
const MAX_ZOOM = 11;

export const PANE_GRENZEN = "grenzen";
const Z_GRENZEN = 400;

interface Props {
  className?: string;
  ariaLabel?: string;
  // In coöperatieve modus (embed) staat wielzoom uit tot een klik op de kaart,
  // en op mobiel het slepen tot een tik — zodat de pagina blijft scrollen.
  coöperatief?: boolean;
  onKaart?: (kaart: LeafletKaartInstantie, L: LeafletModule) => void | (() => void);
}

export default function LeafletKaart({ className, ariaLabel, coöperatief, onKaart }: Props) {
  const houderRef = useRef<HTMLDivElement>(null);
  const onKaartRef = useRef(onKaart);
  onKaartRef.current = onKaart;
  const coöpRef = useRef(coöperatief);
  coöpRef.current = coöperatief;

  useEffect(() => {
    let opgeruimd = false;
    let kaart: LeafletType.Map | null = null;
    let opruimenExtern: void | (() => void);
    let resizeWaarnemer: ResizeObserver | null = null;

    (async () => {
      const L = await import("leaflet");
      if (opgeruimd || !houderRef.current) return;
      const houder = houderRef.current;

      const hoeken = L.latLngBounds(FRANKRIJK_ZUIDWEST, FRANKRIJK_NOORDOOST);
      const coöp = !!coöpRef.current;
      const mobiel = L.Browser.mobile;

      kaart = L.map(houder, {
        center: hoeken.getCenter(),
        zoom: 6,
        minZoom: 4,
        maxZoom: MAX_ZOOM,
        // Strakke begrenzing met een elastische rand die terugveert.
        maxBounds: hoeken.pad(0.06),
        maxBoundsViscosity: 0.8,
        zoomControl: true,
        attributionControl: true,
        keyboard: true,
        worldCopyJump: false,
        // Gedempt zoomen: halve stappen en meer wielweg per niveau, zodat één
        // wieltik niet twee niveaus springt.
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 120,
        // Coöperatief in embed: wiel uit tot klik; op mobiel slepen uit tot tik.
        scrollWheelZoom: !coöp,
        dragging: !(coöp && mobiel),
      });
      kaart.fitBounds(hoeken);

      // minZoom zó dat Frankrijk het venster vult (cover, inside=true): je kunt
      // niet verder uitzoomen, zodat er nooit Spanje of open zee onder verschijnt.
      // Herberekenen bij een maatverandering.
      const pasMinZoomAan = () => {
        if (!kaart) return;
        const z = kaart.getBoundsZoom(hoeken, true);
        kaart.setMinZoom(z);
        if (kaart.getZoom() < z) kaart.setZoom(z);
      };
      pasMinZoomAan();
      kaart.setView(hoeken.getCenter(), Math.max(kaart.getZoom(), kaart.getBoundsZoom(hoeken, true)));

      L.tileLayer("https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers, tegels &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: MAX_ZOOM,
        detectRetina: true,
      }).addTo(kaart);

      kaart.createPane(PANE_GRENZEN);
      const grenzenPane = kaart.getPane(PANE_GRENZEN);
      if (grenzenPane) grenzenPane.style.zIndex = String(Z_GRENZEN);

      try {
        const res = await fetch("/departementen.geojson");
        if (res.ok && !opgeruimd && kaart) {
          const gj = (await res.json()) as GeoJSON.GeoJsonObject;
          L.geoJSON(gj, {
            pane: PANE_GRENZEN,
            interactive: false,
            style: { color: "#800000", weight: 1, opacity: 0.35, fillOpacity: 0 },
          }).addTo(kaart);
        }
      } catch {
        /* zonder grenzen werkt de kaart nog steeds */
      }

      // Coöperatieve gebaren: hint tonen, en pas activeren na klik/tik.
      if (coöp) {
        const hint = L.DomUtil.create("div", styles.wielHint, houder);
        hint.textContent = mobiel ? "Tik om de kaart te gebruiken" : "Klik om te zoomen";
        houder.classList.add(styles.coop);
        if (mobiel) houder.classList.add(styles.toonHint);

        let actief = false;
        const activeer = () => {
          if (actief || !kaart) return;
          actief = true;
          kaart.scrollWheelZoom.enable();
          if (mobiel) kaart.dragging.enable();
          houder.classList.remove(styles.toonHint);
          houder.classList.add(styles.actief);
        };
        const deactiveer = () => {
          if (!actief || !kaart) return;
          actief = false;
          kaart.scrollWheelZoom.disable();
          if (mobiel) kaart.dragging.disable();
          houder.classList.remove(styles.actief);
        };
        kaart.on("click", activeer);
        houder.addEventListener("focusin", activeer);
        houder.addEventListener("mouseenter", () => {
          if (!actief) houder.classList.add(styles.toonHint);
        });
        houder.addEventListener("mouseleave", () => {
          houder.classList.remove(styles.toonHint);
          deactiveer();
        });
        houder.addEventListener("focusout", (e) => {
          if (!houder.contains((e as FocusEvent).relatedTarget as Node)) deactiveer();
        });
      }

      resizeWaarnemer = new ResizeObserver(() => {
        kaart?.invalidateSize();
        pasMinZoomAan();
      });
      resizeWaarnemer.observe(houder);

      if (onKaartRef.current) opruimenExtern = onKaartRef.current(kaart, L);
    })();

    return () => {
      opgeruimd = true;
      if (typeof opruimenExtern === "function") opruimenExtern();
      resizeWaarnemer?.disconnect();
      kaart?.remove();
    };
  }, []);

  return (
    <div
      ref={houderRef}
      className={`${styles.kaart} ${className ?? ""}`}
      role="application"
      aria-label={ariaLabel ?? "Interactieve kaart"}
    />
  );
}
