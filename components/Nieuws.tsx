"use client";

// Gedeelde clientlogica en weergave voor het automatische nieuws.
//   - useNieuws(): haalt /api/nieuws op, ververst zichzelf en onthoudt de
//     laatst GESLAAGDE stand, zodat een mislukte ronde de kolom niet leegmaakt.
//   - Nieuwsgroepen: toont de twee gescheiden groepen (officieel boven, pers
//     eronder), per item kop/tijd/bron/link, en onderaan de uitklapbare
//     bronstatus. Twee thema's (donker = zijlade, licht = kaartblok).

import { useEffect, useState } from "react";
import type { NieuwsAntwoord, NieuwsItem } from "@/lib/nieuws-filter";
import styles from "@/components/Nieuwsgroepen.module.css";

const VERVERS_MS = 15 * 60 * 1000; // 15 min, spiegelt de route-revalidate

export interface NieuwsHaal {
  laden: boolean;
  data: NieuwsAntwoord | null; // laatst geslaagde stand, of de laatste poging
  allesMislukt: boolean; // laatste poging: álle bronnen faalden
  laatstGeslaagd: string | null; // ISO van de laatst geslaagde ronde
  aantal: number; // zichtbare items over beide groepen (voor de teller)
}

export function useNieuws(actief = true): NieuwsHaal {
  const [laatste, setLaatste] = useState<NieuwsAntwoord | null>(null);
  const [laatstGoed, setLaatstGoed] = useState<NieuwsAntwoord | null>(null);
  const [laden, setLaden] = useState(false);

  useEffect(() => {
    if (!actief) return;
    let leeft = true;

    const haal = async () => {
      setLaden(true);
      try {
        const res = await fetch("/api/nieuws", { cache: "no-store" });
        const json: NieuwsAntwoord = await res.json();
        if (!leeft) return;
        setLaatste(json);
        if (json.bronnen.some((b) => b.ok)) setLaatstGoed(json);
      } catch {
        /* netwerk-/parsefout: de laatst geslaagde stand blijft staan */
      } finally {
        if (leeft) setLaden(false);
      }
    };

    haal();
    const id = setInterval(haal, VERVERS_MS);
    const opZichtbaar = () => {
      if (document.visibilityState === "visible") haal();
    };
    document.addEventListener("visibilitychange", opZichtbaar);

    return () => {
      leeft = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", opZichtbaar);
    };
  }, [actief]);

  const data = laatstGoed ?? laatste;
  const allesMislukt = laatste
    ? laatste.bronnen.length > 0 && laatste.bronnen.every((b) => !b.ok)
    : false;
  const aantal = data ? data.officieel.length + data.pers.length : 0;

  return {
    laden,
    data,
    allesMislukt,
    laatstGeslaagd: laatstGoed?.laatstGeslaagd ?? null,
    aantal,
  };
}

export function Nieuwsgroepen({
  haal,
  thema,
}: {
  haal: NieuwsHaal;
  thema: "licht" | "donker";
}) {
  const { laden, data, allesMislukt, laatstGeslaagd } = haal;

  if (!data && laden) {
    return <p className={styles.status}>Nieuws laden…</p>;
  }
  if (!data) {
    return <p className={styles.status}>Actueel nieuws is tijdelijk niet beschikbaar.</p>;
  }

  const geenItems = data.officieel.length === 0 && data.pers.length === 0;

  return (
    <div className={styles.wrap} data-thema={thema}>
      {allesMislukt && (
        <p className={styles.waarschuwing} role="status">
          {laatstGeslaagd
            ? `Alle bronnen waren bij de laatste poging onbereikbaar. Hieronder de laatst geslaagde stand — laatst bijgewerkt om ${formatteerTijd(
                laatstGeslaagd
              )}.`
            : "De bronnen zijn op dit moment niet bereikbaar. Zie ‘Bronnen’ hieronder voor de status per bron."}
        </p>
      )}

      {geenItems && !allesMislukt && (
        <p className={styles.status}>
          Er zijn op dit moment geen recente berichten binnen zeven dagen.
        </p>
      )}

      {data.officieel.length > 0 && (
        <NieuwsGroep kop="Officiële bronnen" items={data.officieel} />
      )}
      {data.pers.length > 0 && <NieuwsGroep kop="Pers" items={data.pers} />}

      <details className={styles.bronnen}>
        <summary>Bronnen</summary>
        <ul className={styles.bronnenLijst}>
          {data.bronnen.map((b) => (
            <li key={b.naam} className={styles.bronRegel}>
              <span className={styles.bronNaam}>{b.naam}</span>
              <span className={styles.bronMeta}>
                {b.soort === "officieel" ? "officieel" : "pers"}
                {" · "}
                <span className={b.ok ? styles.ok : styles.mislukt}>
                  {b.ok ? "geslaagd" : "mislukt"}
                </span>
                {b.tijdstip ? ` om ${formatteerTijd(b.tijdstip)}` : ""}
                {b.ok && b.aantal > 0 ? ` · ${b.aantal} getoond` : ""}
                {!b.bevestigd ? " · URL nog niet bevestigd" : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function NieuwsGroep({ kop, items }: { kop: string; items: NieuwsItem[] }) {
  return (
    <section className={styles.groep} aria-label={kop}>
      <h4 className={styles.groepKop}>{kop}</h4>
      <ol className={styles.lijst}>
        {items.map((item) => (
          <li key={`${item.url}-${item.titel}`} className={styles.item}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.titel}
            </a>
            <span className={styles.meta}>
              {formatteerDatum(item.gepubliceerdOp)} · {item.bron}
              {item.paywall ? (
                <span className={styles.paywall}> — abonnement mogelijk vereist</span>
              ) : (
                ""
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatteerDatum(iso: string): string {
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

function formatteerTijd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}
