"use client";

// Paneel "Infographics" in de zijlade. Toont de statische infographics uit
// public/infographics/. Elke afbeelding past in het paneel (max-breedte 100%) en
// is aanklikbaar naar de volledige grootte (opent in een nieuw tabblad). Werkt
// gelijk in embed en standalone: het is puur een gedeelde schil rond <img>'s.

import styles from "@/components/Infographics.module.css";

interface Infographic {
  bestand: string; // pad onder /public
  titel: string; // kort onderschrift, afgeleid van de bestandsnaam
  alt: string;
}

const INFOGRAPHICS: Infographic[] = [
  {
    bestand: "/infographics/geo-meteo-tool.png",
    titel: "Geo- en meteotool",
    alt: "Infographic: de geo- en meteotool voor Frankrijk",
  },
  {
    bestand: "/infographics/wat-te-doen-bij-bosbrand.png",
    titel: "Wat te doen bij bosbrand",
    alt: "Infographic: wat te doen bij een bosbrand in Frankrijk",
  },
];

export function ZijkolomInfographics() {
  return (
    <div className={styles.paneel}>
      <p className={styles.inleiding}>
        Twee infographics om te bewaren of te delen. Klik op een afbeelding om hem op ware
        grootte te openen.
      </p>
      {INFOGRAPHICS.map((item) => (
        <figure key={item.bestand} className={styles.figuur}>
          <a
            className={styles.link}
            href={item.bestand}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* Statische PNG's; met een gewone <img> schalen ze netjes mee in het
                paneel zonder next/image-configuratie. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.afbeelding} src={item.bestand} alt={item.alt} loading="lazy" />
          </a>
          <figcaption className={styles.onderschrift}>{item.titel}</figcaption>
        </figure>
      ))}
    </div>
  );
}
