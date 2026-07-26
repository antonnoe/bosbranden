"use client";

// Meldt in embed-modus de eigen hoogte aan de ouderpagina (NING) via
// postMessage, zodat het iframe zich vanzelf op de inhoud aanpast.
//
// Twee dingen zijn hier essentieel en met opzet zo gedaan:
//  1. We meten de ELEMENT-hoogte van het wrapper-element, niet
//     document.body.scrollHeight. body.scrollHeight kan meegroeien met de
//     iframe-hoogte die de ouder instelt, waardoor een oplopende lus ontstaat.
//  2. We melden ALLEEN bij een echte wijziging. Zo stopt het berichtenverkeer
//     zodra de hoogte stabiel is.

import { useEffect } from "react";

const BERICHT = "nlfrBosbrandenHeight";

export default function EmbedHoogte({ actief }: { actief: boolean }) {
  useEffect(() => {
    if (!actief || typeof window === "undefined") return;

    const wrapper =
      document.querySelector<HTMLElement>(".omhulsel") ?? document.body;
    let laatsteHoogte = -1;
    let frame = 0;

    const meld = () => {
      // Element-hoogte van de inhoud, niet body.scrollHeight.
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
