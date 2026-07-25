import styles from "@/components/CamsVerwijzing.module.css";

export default function CamsVerwijzing() {
  return (
    <div className="omhulsel">
      <section className={`sectie ${styles.sectie}`} aria-labelledby="cams-titel">
        <div className={styles.kop}>
          <div>
            <p className={styles.label}>Aanvullende officiële dienst</p>
            <h2 id="cams-titel">Rook- en aerosolpatronen bekijken</h2>
          </div>
          <span className={styles.bron}>CAMS · Copernicus</span>
        </div>

        <p className={styles.inleiding}>
          De CAMS Aerosol Alerts-kaart toont modelverwachtingen tot drie dagen vooruit voor onder
          meer organische aerosolen, roet, PM2.5 en wind. Deze informatie kan helpen bij het volgen
          van grote rook- of aerosolpluimen, maar bevestigt geen lokale natuurbrand.
        </p>

        <div className={styles.opties}>
          <article className={styles.optie}>
            <h3>Bekijk de interactieve kaart</h3>
            <p>
              Kies op de CAMS-kaart een aerosolsoort, tijdstip en weergave. Windpijlen tonen de
              verwachte luchtstroming.
            </p>
            <a
              className={styles.knop}
              href="https://aerosol-alerts.atmosphere.copernicus.eu/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open interactieve CAMS-kaart
            </a>
          </article>

          <article className={styles.optie}>
            <h3>Ontvang een waarschuwing</h3>
            <p>
              Teken een gebied en ontvang per e-mail een melding wanneer CAMS daar verhoogde
              aerosol- of fijnstofwaarden verwacht.
            </p>
            <a
              className={`${styles.knop} ${styles.secundair}`}
              href="https://aerosol-alerts.atmosphere.copernicus.eu/subscription/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stel een aerosolwaarschuwing in
            </a>
          </article>
        </div>

        <p className={styles.caveat}>
          Organische aerosolen en roet kunnen samenhangen met natuurbrandrook, maar ook met andere
          bronnen. Gebruik lokale meldingen van prefectuur, mairie en FR-Alert voor officiële
          informatie over een concrete brand.
        </p>
      </section>
    </div>
  );
}
