"use client";

// Paneel 3 van de zijlade: de AI-duider (Functie A — postcode-duiding). GEEN
// vrije chatbot: het paneel toont een korte, feitelijke samenvatting voor een
// postcode en biedt één vervolgvraagveld. Alle begrenzingen (noodsignaal vóór
// het model, IP-limiet, URL-filter, geen tools) zitten server-side in
// /api/assistent; dit paneel stuurt alleen postcode + eventuele vraag mee.
//
// Zonder postcode: één regel uitleg + het postcodeveld (UI-eis). Werkt zowel
// standalone als in embed (?embed=1): het paneel voegt geen bediening aan de
// kaart toe en leest de postcode uit de URL als die er al is.

import { useEffect, useRef, useState } from "react";
import styles from "@/components/Duiding.module.css";

interface AssistentAntwoord {
  antwoord: string;
  noodsignaal?: boolean;
  limiet?: boolean;
  bron?: string;
}

async function vraagAssistent(body: Record<string, unknown>): Promise<AssistentAntwoord> {
  const res = await fetch("/api/assistent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as AssistentAntwoord | null;
  if (json && typeof json.antwoord === "string") return json;
  return { antwoord: "De duider kon nu niet worden opgehaald. Probeer het later opnieuw." };
}

export function ZijkolomDuiding() {
  const [postcode, setPostcode] = useState("");
  const [actievePostcode, setActievePostcode] = useState<string | null>(null);
  const [samenvatting, setSamenvatting] = useState<AssistentAntwoord | null>(null);
  const [bezigSamenvatting, setBezigSamenvatting] = useState(false);

  const [vraag, setVraag] = useState("");
  const [antwoord, setAntwoord] = useState<AssistentAntwoord | null>(null);
  const [bezigVraag, setBezigVraag] = useState(false);
  const gestart = useRef(false);

  // Postcode uit de URL voorvullen (dezelfde ?postcode= die de postcode-check
  // schrijft). Draait één keer; daarna beheert het paneel zijn eigen veld.
  useEffect(() => {
    if (gestart.current) return;
    gestart.current = true;
    try {
      const pc = new URLSearchParams(window.location.search).get("postcode")?.replace(/\D/g, "");
      if (pc && pc.length === 5) {
        setPostcode(pc);
        void haalSamenvatting(pc);
      }
    } catch {
      /* geen URL beschikbaar: paneel start leeg */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function haalSamenvatting(pc: string) {
    setActievePostcode(pc);
    setSamenvatting(null);
    setAntwoord(null);
    setVraag("");
    setBezigSamenvatting(true);
    const res = await vraagAssistent({ modus: "duiding", postcode: pc });
    setSamenvatting(res);
    setBezigSamenvatting(false);
  }

  function opPostcodeVerzenden(e: React.FormEvent) {
    e.preventDefault();
    const cijfers = postcode.replace(/\D/g, "");
    if (cijfers.length !== 5) return;
    void haalSamenvatting(cijfers);
  }

  async function opVraagVerzenden(e: React.FormEvent) {
    e.preventDefault();
    const tekst = vraag.trim();
    if (!tekst || !actievePostcode || bezigVraag) return;
    setBezigVraag(true);
    setAntwoord(null);
    const res = await vraagAssistent({ modus: "duiding", postcode: actievePostcode, vraag: tekst });
    setAntwoord(res);
    setBezigVraag(false);
  }

  return (
    <div className={styles.paneel}>
      <p className={styles.inleiding}>
        De duider vat kort samen wat de kaart- en weergegevens nú voor een postcode betekenen.
        Hij herformuleert alleen die gegevens en is geen hulpdienst — bel bij gevaar altijd 112.
      </p>

      <form className={styles.postcodeVorm} onSubmit={opPostcodeVerzenden}>
        <label htmlFor="duiding-postcode" className={styles.veldLabel}>
          Franse postcode (5 cijfers)
        </label>
        <div className={styles.veldRij}>
          <input
            id="duiding-postcode"
            className={styles.postcodeVeld}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="bijv. 33000"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
          <button
            type="submit"
            className={styles.knop}
            disabled={postcode.replace(/\D/g, "").length !== 5 || bezigSamenvatting}
          >
            {bezigSamenvatting ? "Bezig…" : "Duiding"}
          </button>
        </div>
      </form>

      {actievePostcode && (
        <div className={styles.antwoordBlok}>
          <p className={styles.antwoordKop}>Duiding voor {actievePostcode}</p>
          {bezigSamenvatting ? (
            <p className={styles.laden}>De duider stelt de samenvatting op…</p>
          ) : (
            samenvatting && (
              <p className={samenvatting.noodsignaal ? styles.nood : styles.antwoordTekst}>
                {samenvatting.antwoord}
              </p>
            )
          )}
        </div>
      )}

      {actievePostcode && samenvatting && !bezigSamenvatting && (
        <form className={styles.vraagVorm} onSubmit={opVraagVerzenden}>
          <label htmlFor="duiding-vraag" className={styles.veldLabel}>
            Eén vervolgvraag over deze postcode
          </label>
          <textarea
            id="duiding-vraag"
            className={styles.vraagVeld}
            rows={2}
            maxLength={500}
            placeholder="bijv. Wat betekent die satellietwaarneming precies?"
            value={vraag}
            onChange={(e) => setVraag(e.target.value)}
          />
          <button type="submit" className={styles.knop} disabled={!vraag.trim() || bezigVraag}>
            {bezigVraag ? "Bezig…" : "Vraag stellen"}
          </button>
        </form>
      )}

      {bezigVraag && <p className={styles.laden}>De duider stelt een antwoord op…</p>}
      {antwoord && !bezigVraag && (
        <p className={antwoord.noodsignaal ? styles.nood : styles.antwoordTekst}>
          {antwoord.antwoord}
        </p>
      )}
    </div>
  );
}
