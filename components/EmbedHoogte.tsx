"use client";

// Meldt in embed-modus de eigen hoogte aan de ouderpagina (NING) via
// postMessage, zodat het iframe zich vanzelf op de inhoud aanpast.
//
// Drie dingen zijn hier essentieel en met opzet zo gedaan:
//  1. We meten de border-box-hoogte van <body> met getBoundingClientRect —
//     NIET body.scrollHeight en NIET één losse .omhulsel. body.scrollHeight
//     kan meegroeien met de iframe-hoogte (oplopende lus); de rect-hoogte van
//     body volgt daarentegen de werkelijke inhoud en blijft stabiel als het
//     iframe groter is dan de inhoud. En body vangt ALLE inhoudsblokken: de
//     pagina / heeft er twee (de brandtool én de CAMS-verwijzing), elk in een
//     eigen .omhulsel. Eén .omhulsel meten zou de CAMS-sectie afsnijden en een
//     binnenscrollbalk geven.
//  2. De vaste Zijlade-schil is position:fixed en telt niet mee in de
//     body-rect, dus paneel openen/sluiten verandert de gemelde hoogte niet.
//  3. We melden ALLEEN bij een echte wijziging. Zo stopt het berichtenverkeer
//     zodra de hoogte stabiel is.

import { useEffect } from "react";

const BERICHT = "nlfrBosbrandenHeight";

export default function EmbedHoogte({ actief }: { actief: boolean }) {
  useEffect(() => {
    if (!actief || typeof window === "undefined") return;

    const wrapper = document.body;
    let laatsteHoogte = -1;
    let frame = 0;

    const meld = () => {
      // Volledige inhoudshoogte (alle blokken), niet body.scrollHeight.
      const hoogte = Math.ceil(wrapper.getBoundingClientRect().height);
      if (hoogte <= 0 || hoogte === laatsteHoogte) return; // alleen bij wijziging
      laatsteHoogte = hoogte;
      window.parent?.postMessage({ type: BERICHT, hoogte }, "*");
    };

    const plan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(meld);
    };

    const observer = new ResizeObserver(plan);
    observer.observe(wrapper);
    plan();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [actief]);

  return null;
}
