"use client";

// Generieke Leaflet-kaartschil. Bevat géén rook-, brand- of FIRMS-specifieke
// logica: alleen initialisatie, opruimen, resize, de gedempte basiskaart, de
// departementsgrenzen en de begrenzing op Frankrijk. De datalagen komen van
// buitenaf: de ouder krijgt via onKaart de kaart en de Leaflet-module en beheert
// daarmee zijn eigen lagen (in eigen panes). Zo kan de brandkaart later dezelfde
// schil hergebruiken.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import styles from "@/components/kaart/LeafletKaart.module.css";
import type * as LeafletType from "leaflet";

export type LeafletModule = typeof LeafletType;
export type LeafletKaartInstantie = LeafletType.Map;

// Frankrijk métropole inclusief Corsica. Iets ruimer dan de departementen zelf,
// zodat de randen niet tegen het kader plakken.
const FRANKRIJK_ZUIDWEST: [number, number] = [41.0, -5.6];
const FRANKRIJK_NOORDOOST: [number, number] = [51.6, 9.9];
const MIN_ZOOM = 5;
const MAX_ZOOM = 11;

// Pane-hoogtes. De grenzen liggen op 400; datalagen die eronder horen
// (satelliet, fijnstof) gebruiken een lagere z, lagen die erboven horen
// (pluimen, bronnen) een hogere. De ouder maakt zijn eigen panes.
export const PANE_GRENZEN = "grenzen";
const Z_GRENZEN = 400;

interface Props {
  className?: string;
  ariaLabel?: string;
  // Wordt één keer aangeroepen zodra de kaart klaar is. Een eventuele
  // teruggegeven functie wordt bij het opruimen aangeroepen.
  onKaart?: (kaart: LeafletKaartInstantie, L: LeafletModule) => void | (() => void);
}

export default function LeafletKaart({ className, ariaLabel, onKaart }: Props) {
  const houderRef = useRef<HTMLDivElement>(null);
  // onKaart in een ref, zodat een nieuwe (inline) functie de kaart niet opnieuw
  // opbouwt. De kaart wordt precies één keer geïnitialiseerd.
  const onKaartRef = useRef(onKaart);
  onKaartRef.current = onKaart;

  useEffect(() => {
    let opgeruimd = false;
    let kaart: LeafletType.Map | null = null;
    let opruimenExtern: void | (() => void);
    let resizeWaarnemer: ResizeObserver | null = null;

    (async () => {
      const L = await import("leaflet");
      if (opgeruimd || !houderRef.current) return;

      const hoeken = L.latLngBounds(FRANKRIJK_ZUIDWEST, FRANKRIJK_NOORDOOST);
      kaart = L.map(houderRef.current, {
        center: hoeken.getCenter(),
        zoom: 6,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: hoeken.pad(0.12),
        maxBoundsViscosity: 0.85,
        zoomControl: true,
        attributionControl: true,
        keyboard: true,
        worldCopyJump: false,
      });
      kaart.fitBounds(hoeken);

      // Gedempte, lichte basiskaart zodat de datalagen leesbaar blijven.
      L.tileLayer("https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers, tegels &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: MAX_ZOOM,
        detectRetina: true,
      }).addTo(kaart);

      // Pane voor de departementsgrenzen (boven de datalagen die eronder horen).
      kaart.createPane(PANE_GRENZEN);
      const grenzenPane = kaart.getPane(PANE_GRENZEN);
      if (grenzenPane) grenzenPane.style.zIndex = String(Z_GRENZEN);

      // Departementsgrenzen als rustige onderlaag (niet klikbaar).
      try {
        const res = await fetch("/departementen.geojson");
        if (res.ok && !opgeruimd && kaart) {
          const gj = (await res.json()) as GeoJSON.GeoJsonObject;
          L.geoJSON(gj, {
            pane: PANE_GRENZEN,
            interactive: false,
            style: {
              color: "#800000",
              weight: 1,
              opacity: 0.35,
              fillOpacity: 0,
            },
          }).addTo(kaart);
        }
      } catch {
        /* zonder grenzen werkt de kaart nog steeds */
      }

      // Container mee laten schalen met de kolom/embed-breedte.
      resizeWaarnemer = new ResizeObserver(() => kaart?.invalidateSize());
      resizeWaarnemer.observe(houderRef.current);

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
