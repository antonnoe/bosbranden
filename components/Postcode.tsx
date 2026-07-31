"use client";

// Eén gedeeld postcodeveld voor de drie pagina's (/, /start, /rook). De check is
// overal gelijk: precies vijf cijfers, normaliseren, en de postcode in de URL
// schrijven (?postcode=, met behoud van embed) zodat het antwoord meereist en de
// link deelbaar blijft. Wat de pagina met de gevonden postcode tóónt (kaart,
// niveaus, windbaan) beslist de pagina zelf; dat verschilt per pagina en hoort
// dus niet in dit veld.
//
// Twee standen:
//   - "knop": met verzendknop (/, /rook). Bij minder dan vijf cijfers volgt een
//     nette foutmelding via onFout, geen stille afwijzing.
//   - "direct": zonder knop (/start). Zodra er vijf cijfers staan reist de
//     postcode mee; er is geen tweede handeling nodig.

import { useId } from "react";

export function schrijfPostcodeInUrl(cijfers: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    params.set("postcode", cijfers);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  } catch {
    /* history kan in een sandbox geblokkeerd zijn; dan reist de postcode alleen
       binnen de sessie mee */
  }
}

interface PostcodeProps {
  waarde: string;
  onWaarde: (waarde: string) => void;
  // Aangeroepen met de vijf cijfers zodra de postcode geldig is: bij verzenden
  // (knop-modus) of zodra er vijf cijfers staan (direct-modus).
  onZoek?: (cijfers: string) => void;
  // Alleen knop-modus: minder dan vijf cijfers bij verzenden.
  onFout?: (melding: string) => void;
  modus?: "knop" | "direct";
  knopLabel?: string;
  bezig?: boolean;
  bezigLabel?: string;
  placeholder?: string;
  schrijfUrl?: boolean;
}

export default function Postcode({
  waarde,
  onWaarde,
  onZoek,
  onFout,
  modus = "knop",
  knopLabel = "Toon gevaarniveau",
  bezig = false,
  bezigLabel,
  placeholder = "bijv. 66000",
  schrijfUrl = true,
}: PostcodeProps) {
  const veldId = useId();

  function verwerk(cijfers: string) {
    if (schrijfUrl) schrijfPostcodeInUrl(cijfers);
    onZoek?.(cijfers);
  }

  function bijWijziging(ruw: string) {
    onWaarde(ruw);
    if (modus === "direct") {
      const cijfers = ruw.replace(/\D/g, "");
      if (cijfers.length === 5) verwerk(cijfers);
    }
  }

  function bijVerzenden(e: React.FormEvent) {
    e.preventDefault();
    if (modus !== "knop") return;
    const cijfers = waarde.replace(/\D/g, "");
    if (cijfers.length !== 5) {
      onFout?.("Een Franse postcode heeft vijf cijfers.");
      return;
    }
    verwerk(cijfers);
  }

  return (
    <form className="postcode-vorm" noValidate onSubmit={bijVerzenden}>
      <label htmlFor={veldId} style={{ position: "absolute", left: "-9999px" }}>
        Franse postcode
      </label>
      <input
        id={veldId}
        name="postcode"
        inputMode="numeric"
        pattern="[0-9]{5}"
        autoComplete="postal-code"
        placeholder={placeholder}
        maxLength={5}
        value={waarde}
        onChange={(e) => bijWijziging(e.target.value)}
      />
      {modus === "knop" && (
        <button className="knop" type="submit" disabled={bezig}>
          {bezig ? bezigLabel ?? "Bezig…" : knopLabel}
        </button>
      )}
    </form>
  );
}
