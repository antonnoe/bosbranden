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
          De CAMS-kaart van Copernicus toont modelverwachtingen tot drie dagen vooruit voor rook-
          en aerosolpluimen; dit bevestigt geen lokale natuurbrand.
        </p>

        <a
          className={styles.knop}
          href="https://aerosol-alerts.atmosphere.copernicus.eu/?lat=44.591095693885364&lon=-5.447755795617844&zoom=3&height=19551000&base_layer=none&overlays=&view=2d&parameter=od550dust%2Bod550ss%2Bod550so4%2Bod550oa%2Bod550bc"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open de CAMS-kaart
        </a>
      </section>
    </div>
  );
}
