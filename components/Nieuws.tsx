"use client";

// Gedeelde clientlogica en weergave voor het automatische nieuws.
//   - useNieuws(): haalt /api/nieuws op, ververst zichzelf en onthoudt de
//     laatst GESLAAGDE stand, zodat een mislukte ronde de kolom niet leegmaakt.
//   - Nieuwsgroepen: toont de twee gescheiden groepen (officieel boven, pers
//     eronder), per item kop/tijd/bron/link, en onderaan de uitklapbare
//     bronstatus. Twee thema's (donker = zijlade, licht = kaartblok).

import { useEffect, useState, type ReactNode } from "react";
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
  // Geopend artikel (H3): toont de volledige Nederlandse samenvatting in het
  // paneel, in plaats van meteen naar het originele artikel te linken.
  const [geopend, setGeopend] = useState<NieuwsItem | null>(null);

  if (!data && laden) {
    return <p className={styles.status}>Nieuws laden…</p>;
  }
  if (!data) {
    return <p className={styles.status}>Actueel nieuws is tijdelijk niet beschikbaar.</p>;
  }

  const geenItems = data.officieel.length === 0 && data.pers.length === 0;

  if (geopend) {
    return (
      <div className={styles.wrap} data-thema={thema}>
        <NieuwsDetail item={geopend} onTerug={() => setGeopend(null)} />
      </div>
    );
  }

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
        <NieuwsGroep kop="Officiële bronnen" items={data.officieel} onOpen={setGeopend} />
      )}
      {data.pers.length > 0 && (
        <NieuwsGroep kop="Pers" items={data.pers} onOpen={setGeopend} />
      )}

      {!geenItems && (
        <p className={styles.vertaalNoot}>
          De samenvattingen zijn machinaal in het Nederlands vertaald. De originele artikelen
          kunt u met de rechtermuisknop door uw browser laten vertalen.
        </p>
      )}

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

function NieuwsGroep({
  kop,
  items,
  onOpen,
}: {
  kop: string;
  items: NieuwsItem[];
  onOpen: (item: NieuwsItem) => void;
}) {
  return (
    <section className={styles.groep} aria-label={kop}>
      <h4 className={styles.groepKop}>{kop}</h4>
      <ol className={styles.lijst}>
        {items.map((item) => {
          const gelukt = item.vertaling === "ok" && !!item.samenvatting;
          return (
            <li key={`${item.url}-${item.titel}`} className={styles.item}>
              {gelukt ? (
                // Nederlandse kop; klik opent de samenvatting in het paneel (H2/H3).
                <button
                  type="button"
                  className={styles.itemKnop}
                  onClick={() => onOpen(item)}
                >
                  {item.titelNl ?? item.titel}
                </button>
              ) : (
                // H5: vertaling mislukt → Franse kop + mededeling, link naar origineel.
                <>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.titel}
                  </a>
                  <span className={styles.vertaalMislukt}>
                    Nederlandse vertaling nu niet beschikbaar
                  </span>
                </>
              )}
              <span className={styles.meta}>
                {formatteerDatum(item.gepubliceerdOp)} · {item.bron}
                {item.paywall ? (
                  <span className={styles.paywall}> — abonnement mogelijk vereist</span>
                ) : (
                  ""
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Detailweergave: de volledige Nederlandse samenvatting, met bronnaam, een link
// naar het originele artikel en de eventuele ecosystem-links (H3).
function NieuwsDetail({ item, onTerug }: { item: NieuwsItem; onTerug: () => void }) {
  return (
    <div className={styles.detail}>
      <button type="button" className={styles.detailTerug} onClick={onTerug}>
        ← Terug naar het nieuws
      </button>
      <h4 className={styles.detailKop}>{item.titelNl ?? item.titel}</h4>
      <div className={styles.detailBody}>{renderMarkdown(item.samenvatting ?? "")}</div>
      <p className={styles.detailBron}>Bron: {item.bron}</p>
      <a
        className={styles.detailLink}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Lees het originele artikel
      </a>
      {item.ecosystemLinks && item.ecosystemLinks.length > 0 && (
        <div className={styles.eco}>
          <p className={styles.ecoKop}>Meer over dit onderwerp</p>
          <ul className={styles.ecoLijst}>
            {item.ecosystemLinks.map((link, i) => (
              <li key={i}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Compacte, veilige markdown-weergave (geen dangerouslySetInnerHTML, geen extra
// afhankelijkheid): koppen, alinea's, opsommingen, vet en links.
function renderInline(tekst: string, sleutel: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let laatste = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(tekst)) !== null) {
    if (m.index > laatste) nodes.push(tekst.slice(laatste, m.index));
    if (m[1] && /^https?:\/\//.test(m[2])) {
      nodes.push(
        <a key={`${sleutel}-a${i}`} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </a>
      );
    } else if (m[1]) {
      nodes.push(m[1]);
    } else if (m[3]) {
      nodes.push(<strong key={`${sleutel}-b${i}`}>{m[3]}</strong>);
    }
    laatste = regex.lastIndex;
    i += 1;
  }
  if (laatste < tekst.length) nodes.push(tekst.slice(laatste));
  return nodes;
}

function renderMarkdown(md: string): ReactNode[] {
  const regels = md.split(/\r?\n/);
  const blokken: ReactNode[] = [];
  let lijst: string[] = [];
  let para: string[] = [];

  const spoelPara = (k: string | number) => {
    if (para.length > 0) {
      blokken.push(<p key={`p${k}`}>{renderInline(para.join(" "), `p${k}`)}</p>);
      para = [];
    }
  };
  const spoelLijst = (k: string | number) => {
    if (lijst.length > 0) {
      const huidige = lijst;
      blokken.push(
        <ul key={`u${k}`} className={styles.detailLijst}>
          {huidige.map((li, i) => (
            <li key={i}>{renderInline(li, `u${k}-${i}`)}</li>
          ))}
        </ul>
      );
      lijst = [];
    }
  };

  regels.forEach((ruw, idx) => {
    const r = ruw.trim();
    if (!r) {
      spoelPara(idx);
      spoelLijst(idx);
      return;
    }
    const kop = r.match(/^(#{1,6})\s+(.*)$/);
    if (kop) {
      spoelPara(idx);
      spoelLijst(idx);
      blokken.push(
        <p key={`h${idx}`} className={styles.detailSubkop}>
          {renderInline(kop[2], `h${idx}`)}
        </p>
      );
      return;
    }
    const li = r.match(/^[-*]\s+(.*)$/);
    if (li) {
      spoelPara(idx);
      lijst.push(li[1]);
      return;
    }
    spoelLijst(idx);
    para.push(r);
  });

  spoelPara("end");
  spoelLijst("end");
  return blokken;
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
