"use client";

// Fable-stijl laadindicator: dunne doorlopende lijn met vloeiend bewegend
// accent (geen spinner), met rustig wisselende faselabels eronder.

import { useEffect, useState } from "react";

const FASEN = ["Gegevens ophalen bij Météo-France…", "Verwerken…", "Tonen…"];

export default function Voortgang() {
  const [fase, setFase] = useState(0);
  const [wisselt, setWisselt] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setWisselt(true);
      setTimeout(() => {
        setFase((f) => (f + 1) % FASEN.length);
        setWisselt(false);
      }, 450);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="voortgang" role="status" aria-live="polite">
      <div className="voortgang-lijn">
        <div className="voortgang-accent" />
      </div>
      <div className={`voortgang-fase${wisselt ? " wisselt" : ""}`}>{FASEN[fase]}</div>
    </div>
  );
}
