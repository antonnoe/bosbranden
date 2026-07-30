"use client";

// Bronnen-tab binnen de Verantwoording-lade. Toont per kaartlaag de bron en het
// tijdstip van de laatste verversing. Puur presentatie: leest alleen bestaande
// routes (read-only, géén nieuwe of gewijzigde API's) en haalt de tijdstempels
// uit de data — niets gehardcodeerd. Wordt pas gemount als de Bronnen-tab open
// is, dus de fetches lopen niet bij een dichte lade.
//
// De lade heeft een bordeaux (#800000) achtergrond met witte tekst; de in de
// opdracht genoemde donkere kleuren (rgba(51,39,39,…)) zijn hier naar lichte
// varianten vertaald zodat ze op die achtergrond leesbaar blijven.

import { useEffect, useState } from "react";

interface BronRegel {
  laag: string; // kaartlaag (vet)
  bron: string; // herkomst (ondertitel)
  pad: string; // bestaande route waar het tijdstempel uit komt
}

const BRONNEN: BronRegel[] = [
  { laag: "Hittebronnen", bron: "NASA FIRMS · VIIRS", pad: "/api/waarnemingen" },
  { laag: "Brandgevaar", bron: "Météo-France", pad: "/api/danger" },
  { laag: "Officiële meldingen", bron: "FR-Alert", pad: "/api/fr-alert" },
];

function formatteerTijd(iso: string | null): string {
  if (!iso) return "onbekend";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

export function ZijkolomBronnen() {
  // Per route het opgehaalde tijdstempel (undefined = nog aan het laden).
  const [tijden, setTijden] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let actief = true;
    (async () => {
      const resultaten = await Promise.all(
        BRONNEN.map(async ({ pad }) => {
          try {
            const res = await fetch(pad, { headers: { Accept: "application/json" } });
            const json: { bijgewerkt?: string | null } = await res.json();
            return [pad, json?.bijgewerkt ?? null] as const;
          } catch {
            return [pad, null] as const;
          }
        })
      );
      if (actief) setTijden(Object.fromEntries(resultaten));
    })();
    return () => {
      actief = false;
    };
  }, []);

  return (
    <div>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: "0.92rem",
          lineHeight: 1.55,
          color: "rgba(255, 255, 255, 0.9)",
        }}
      >
        Per kaartlaag de bron en wanneer die voor het laatst is ververst.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {BRONNEN.map(({ laag, bron, pad }) => {
          const geladen = pad in tijden;
          return (
            <li
              key={pad}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid rgba(255, 255, 255, 0.16)",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 700,
                    color: "#ffffff",
                  }}
                >
                  {laag}
                </span>
                <span style={{ display: "block", fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.78)" }}>
                  {bron}
                </span>
              </span>
              <span
                style={{
                  flex: "0 0 auto",
                  textAlign: "right",
                  fontSize: "0.82rem",
                  color: "rgba(255, 255, 255, 0.85)",
                  whiteSpace: "nowrap",
                }}
              >
                {geladen ? `bijgewerkt ${formatteerTijd(tijden[pad])}` : "laden…"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
