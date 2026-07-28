"use client";

// Rookmodule op de Leaflet-kaartschil, in volvlak-opzet: de kaart is het
// grootste element, de bediening zweeft erop en de details verschijnen in een
// popup (of, op smalle schermen, een schuifpaneel van onderen). De zware
// berekening staat server-side in lib/rookdrift.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeafletKaart, {
  type LeafletKaartInstantie,
  type LeafletModule,
} from "@/components/kaart/LeafletKaart";
import type * as LT from "leaflet";
import { departementVoorPostcode } from "@/lib/departements";
import { geoBoundsVoorCodes } from "@/lib/departement-bbox";
import Voortgang from "@/components/Voortgang";
import EmbedHoogte from "@/components/EmbedHoogte";
import styles from "@/components/Rookmodule.module.css";

const DEG = Math.PI / 180;
const AARDE_KM = 6371;

// Tijdschuif: −12 uur (terugblik) t/m +24 uur (vooruitblik). De grens tussen
// gemeten en verwachte wind ligt altijd bij nu (0), waar de schuif ook staat.
const SCHUIF_MIN = -12;
const SCHUIF_MAX = 24;

const LAAD_FASEN = [
  "Satellietwaarnemingen ophalen bij NASA FIRMS…",
  "Windveld ophalen bij Open-Meteo…",
  "Hittebronnen clusteren…",
  "Windbanen berekenen…",
];

const PANE_Z: Record<string, number> = {
  satelliet: 300,
  kegels: 450,
  pluimen: 460,
  bronnen: 550,
};

const GIBS_SJABLOON =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";

type Windmodus = "leefniveau" | "ophoogte";

interface Pluim {
  id: string;
  lat: number;
  lon: number;
  detecties: number;
  frp: number | null;
  laatsteDetectie: string;
  bronDepartement: string | null;
  bronDepartementCode: string | null;
  beginOffset: number; // uuroffset van het eerste padpunt t.o.v. nu (≤ 0)
  leefniveau: Array<[number, number]>;
  ophoogte: Array<[number, number]>;
  kmLeefniveau: number;
  kmOphoogte: number;
  richting: string;
}

interface Antwoord {
  beschikbaar: boolean;
  windBeschikbaar: boolean;
  bijgewerkt: string | null;
  startuur: string;
  opmerking?: string;
  pluimen: Pluim[];
}

interface PostcodeAntwoord {
  status: string;
  tekst: string;
  bronId?: string;
  modus?: Windmodus;
  vroegsteUur?: number;
}

export default function Rookmodule({ embed }: { embed: boolean }) {
  const [data, setData] = useState<Antwoord | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);

  const [uur, setUur] = useState(24); // schuif loopt van −12 (12 u geleden) t/m +24 u; begint op +24u (de volle vooruitblik blijft behouden)
  const [modus, setModus] = useState<Windmodus>("leefniveau");
  const [gekozenId, setGekozenId] = useState<string | null>(null);
  const [klikPunt, setKlikPunt] = useState<[number, number] | null>(null);

  const [toonSatelliet, setToonSatelliet] = useState(false);
  const [satelliet, setSatelliet] = useState<{ datum: string; laag: string } | null>(null);
  const [satellietLaden, setSatellietLaden] = useState(false);
  const [satellietFout, setSatellietFout] = useState(false);

  const [dekking, setDekking] = useState(40); // standaard lager, zodat de onderliggende kaart zichtbaar blijft; schuif loopt tot 100
  const [lagenOpen, setLagenOpen] = useState(!embed);
  const [smal, setSmal] = useState(false);

  const [postcode, setPostcode] = useState("");
  const [gezochtePostcode, setGezochtePostcode] = useState("");
  const [postcodeAntwoord, setPostcodeAntwoord] = useState<PostcodeAntwoord | null>(null);
  const [postcodeLaden, setPostcodeLaden] = useState(false);

  const [kaart, setKaart] = useState<{ map: LeafletKaartInstantie; L: LeafletModule } | null>(null);

  const gibsRef = useRef<LT.TileLayer | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const bronKlikRef = useRef(0);

  // Smalle schermen (<600px): geen popup maar een schuifpaneel van onderen.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const ver = () => setSmal(mq.matches);
    ver();
    // Op een smal scherm start het lagenpaneel ingeklapt (één keer, bij mount).
    if (mq.matches) setLagenOpen(false);
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);

  useEffect(() => {
    if (embed) document.documentElement.classList.add("embed");
    let actief = true;
    (async () => {
      try {
        const res = await fetch("/api/rookpluimen");
        const json: Antwoord = await res.json();
        if (!actief) return;
        setData(json);
      } catch {
        if (actief)
          setFout("De rookmodule kon de gegevens niet ophalen. Probeer het over enkele minuten opnieuw.");
      } finally {
        if (actief) setLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [embed]);

  useEffect(() => {
    if (!toonSatelliet || satelliet) return;
    let actief = true;
    setSatellietLaden(true);
    setSatellietFout(false);
    (async () => {
      try {
        const res = await fetch("/api/satellietbeeld?meta=1");
        if (!res.ok) throw new Error("geen datum");
        const j = await res.json();
        if (!j.beschikbaar) throw new Error("geen beeld");
        if (actief) setSatelliet({ datum: j.datum, laag: j.laag });
      } catch {
        if (actief) setSatellietFout(true);
      } finally {
        if (actief) setSatellietLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [toonSatelliet, satelliet]);

  const pluimen = useMemo(() => data?.pluimen ?? [], [data]);
  const gekozen = pluimen.find((p) => p.id === gekozenId) ?? null;

  const kies = useCallback((id: string, latlng: [number, number]) => {
    bronKlikRef.current = performance.now(); // zodat de kaartklik-sluiter deze bronklik niet meteen sluit
    setKlikPunt(latlng);
    setGekozenId((h) => (h === id ? null : id));
  }, []);

  const onKaart = useCallback((map: LeafletKaartInstantie, L: LeafletModule) => {
    for (const [naam, z] of Object.entries(PANE_Z)) {
      map.createPane(naam);
      const pane = map.getPane(naam);
      if (pane) pane.style.zIndex = String(z);
    }
    // Onopvallende debug-handle (ook handig voor end-to-end-controle van de
    // begrenzing); leest alleen, verandert niets.
    (window as unknown as { __rookKaart?: LeafletKaartInstantie }).__rookKaart = map;
    setKaart({ map, L });
  }, []);

  // ---- Pluimen: gemeten deel (doorgetrokken) + verwacht deel (gestippeld,
  // met onzekerheidskegel). De grens ligt altijd bij nu, waar de schuif ook staat.
  useEffect(() => {
    if (!kaart) return;
    const { map, L } = kaart;
    const groep = L.layerGroup().addTo(map);
    if (data?.windBeschikbaar) {
      for (const pluim of pluimen) {
        // Eén onbruikbare pluim mag nooit de hele kaartlaag (en daarmee de
        // pagina) meeslepen: vang een geometriefout per pluim af en sla hem over.
        let geo: ReturnType<typeof bouwPluimGeo> = null;
        try {
          geo = bouwPluimGeo(pluim, modus, uur);
        } catch {
          geo = null;
        }
        if (!geo) continue;
        const isGekozen = pluim.id === gekozenId;
        const klik = (e: LT.LeafletMouseEvent) => kies(pluim.id, [e.latlng.lat, e.latlng.lng]);

        // Onzekerheidskegel: alleen over het verwachte (toekomstige) deel.
        if (geo.kegel.length >= 3) {
          L.polygon(geo.kegel, {
            pane: "kegels",
            color: "rgba(128,0,0,0.28)",
            weight: 1,
            fillColor: "#800000",
            fillOpacity: isGekozen ? 0.18 : 0.1,
            interactive: false,
          }).addTo(groep);
        }

        // Gemeten wind (vóór nu): doorgetrokken lijn.
        if (geo.solid.length >= 2) {
          const lijn = L.polyline(geo.solid, {
            pane: "pluimen",
            color: "#800000",
            weight: isGekozen ? 3.5 : 2.5,
            opacity: isGekozen ? 1 : 0.85,
          });
          lijn.on("click", klik);
          lijn.addTo(groep);
        }

        // Verwachte wind (ná nu): gestippeld en lichter.
        if (geo.dashed && geo.dashed.length >= 2) {
          const lijn = L.polyline(geo.dashed, {
            pane: "pluimen",
            color: "#800000",
            weight: isGekozen ? 3 : 2,
            opacity: isGekozen ? 0.9 : 0.6,
            dashArray: "5 6",
          });
          lijn.on("click", klik);
          lijn.addTo(groep);
        }

        L.circleMarker(geo.eind, {
          pane: "pluimen",
          radius: 4,
          color: "#800000",
          fillColor: "#800000",
          fillOpacity: 1,
          weight: 1,
          interactive: false,
        }).addTo(groep);
      }
    }
    return () => {
      map.removeLayer(groep);
    };
  }, [kaart, data, pluimen, modus, uur, gekozenId, kies]);

  // ---- Bronmarkers (toetsenbord-bereikbaar) ----
  useEffect(() => {
    if (!kaart) return;
    const { map, L } = kaart;
    const groep = L.layerGroup().addTo(map);
    for (const pluim of pluimen) {
      // Een bron bestaat pas zodra hij is waargenomen: toon hem alleen als de
      // schuifstand op of ná zijn waarnemingstijd ligt (beginOffset ≤ uur).
      const bo = Number.isFinite(pluim.beginOffset) ? Math.min(0, pluim.beginOffset) : 0;
      if (data?.windBeschikbaar && uur < bo) continue;
      const isGekozen = pluim.id === gekozenId;
      const label = `Hittebron${pluim.bronDepartement ? ` in ${pluim.bronDepartement}` : ""}, ${pluim.detecties} detecties — klik voor details`;
      const icon = L.divIcon({
        className: styles.bronIcon,
        html: `<span class="${styles.bronDot} ${isGekozen ? styles.bronDotGekozen : ""}"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([pluim.lat, pluim.lon], {
        pane: "bronnen",
        icon,
        keyboard: true,
        title: label,
        alt: label,
      });
      marker.on("click", (e: LT.LeafletMouseEvent) =>
        kies(pluim.id, [e.latlng?.lat ?? pluim.lat, e.latlng?.lng ?? pluim.lon])
      );
      marker.on("keypress", (e: LT.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === "Enter" || e.originalEvent.key === " ") kies(pluim.id, [pluim.lat, pluim.lon]);
      });
      marker.addTo(groep);
    }
    return () => {
      map.removeLayer(groep);
    };
  }, [kaart, pluimen, gekozenId, kies, uur, data]);

  // ---- GIBS-tegellaag ----
  useEffect(() => {
    if (!kaart || !toonSatelliet || !satelliet) return;
    const { map, L } = kaart;
    const laag = L.tileLayer(GIBS_SJABLOON.replace("{TIME}", satelliet.datum), {
      pane: "satelliet",
      maxNativeZoom: 9,
      maxZoom: 11,
      opacity: dekking / 100,
      attribution: "NASA GIBS / EOSDIS",
    });
    laag.addTo(map);
    gibsRef.current = laag;
    return () => {
      map.removeLayer(laag);
      gibsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaart, toonSatelliet, satelliet]);

  useEffect(() => {
    gibsRef.current?.setOpacity(dekking / 100);
  }, [dekking]);

  // ---- Popup bij klik (breed scherm); smal scherm gebruikt het schuifpaneel ----
  // Eigen HTML-overlay (geen Leaflet-popup): zo klemmen we hem — net als op de
  // SVG-kaart — op zijn eigen afmetingen binnen het kaartvlak, houden we de
  // zoomknoppen vrij, en stylen we label/waarde betrouwbaar met CSS-modules.
  useEffect(() => {
    if (!kaart || smal || !gekozen || !klikPunt) return;
    const { map } = kaart;
    const el = popupRef.current;
    if (!el) return;

    const plaats = () => {
      const houder = map.getContainer();
      const cw = houder.clientWidth;
      const ch = houder.clientHeight;
      const pt = map.latLngToContainerPoint(klikPunt as unknown as LT.LatLngExpression);
      const pw = el.offsetWidth;
      const ph = el.offsetHeight;
      const m = 10;
      let left = pt.x - pw / 2;
      let top = pt.y - ph - 16; // boven het punt…
      if (top < m) top = pt.y + 16; // …anders eronder
      left = Math.min(Math.max(left, m), Math.max(m, cw - pw - m));
      top = Math.min(Math.max(top, m), Math.max(m, ch - ph - m));
      // Zoomknoppen linksboven altijd vrijhouden.
      const zoom = houder.querySelector(".leaflet-control-zoom");
      if (zoom) {
        const zr = zoom.getBoundingClientRect();
        const hr = houder.getBoundingClientRect();
        const zRight = zr.right - hr.left + m;
        const zBottom = zr.bottom - hr.top + m;
        if (left < zRight && top < zBottom) {
          if (zRight + pw <= cw - m) left = zRight;
          else top = Math.min(Math.max(zBottom, m), Math.max(m, ch - ph - m));
        }
      }
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };

    plaats();
    map.on("move zoom resize viewreset zoomanim", plaats);
    window.addEventListener("resize", plaats);

    const opEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGekozenId(null);
    };
    // Klik náást de popup (op de kaartachtergrond) sluit; een bronklik niet.
    const opKaartKlik = () => {
      if (performance.now() - bronKlikRef.current < 120) return;
      setGekozenId(null);
    };
    window.addEventListener("keydown", opEscape);
    map.on("click", opKaartKlik);
    return () => {
      map.off("move zoom resize viewreset zoomanim", plaats);
      map.off("click", opKaartKlik);
      window.removeEventListener("resize", plaats);
      window.removeEventListener("keydown", opEscape);
    };
  }, [kaart, gekozen, klikPunt, smal]);

  // C2: zoom de Leaflet-kaart naar de omhullende van het (de) departement(en).
  // fitBounds vecht niet met de elastische Frankrijk-begrenzing: een departement
  // ligt altijd binnen Frankrijk. maxZoom houdt het rustig; padding geeft lucht.
  function zoomNaarDepartement(codes: string[]) {
    if (!kaart) return;
    const grenzen = geoBoundsVoorCodes(codes);
    if (!grenzen) return;
    kaart.map.fitBounds(grenzen, { maxZoom: 9, padding: [24, 24] });
  }

  // Zichtbare weg terug naar heel Frankrijk (C2). Zelfde kader als de
  // beginweergave van de kaart.
  function toonHeelFrankrijk() {
    if (!kaart) return;
    kaart.map.fitBounds([
      [41.33, -5.15],
      [51.09, 9.56],
    ]);
  }

  // C1: schrijf de postcode in de URL (replaceState, geen geschiedenis-entry),
  // met behoud van embed. Zo overleeft hij navigatie én verversen.
  function schrijfPostcodeInUrl(pc: string) {
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("postcode", pc);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {
      /* history kan geblokkeerd zijn; dan blijft alleen de zoom */
    }
  }

  async function zoekPostcode(e: React.FormEvent) {
    e.preventDefault();
    // Valideer vóór het ophalen: precies vijf cijfers, geen stille afwijzing.
    const cijfers = postcode.replace(/\D/g, "");
    if (cijfers.length !== 5) {
      setPostcodeAntwoord({
        status: "fout",
        tekst: "Een Franse postcode heeft vijf cijfers.",
      });
      return;
    }
    setGezochtePostcode(cijfers);
    // C1/C2: URL bijwerken en naar het departement zoomen zodra de invoer geldig
    // is — zichtbaar dat de klik iets deed, ook als er geen pluim in de buurt is.
    const res = departementVoorPostcode(cijfers);
    if (res.type === "ok") {
      schrijfPostcodeInUrl(cijfers);
      zoomNaarDepartement(res.departementen.map((d) => d.code));
    }
    setPostcodeLaden(true);
    setPostcodeAntwoord(null);
    try {
      const res = await fetch(`/api/rookpluimen?postcode=${encodeURIComponent(cijfers)}`);
      const json: Antwoord & { postcode?: PostcodeAntwoord } = await res.json();
      setPostcodeAntwoord(json.postcode ?? null);
      if (json.postcode?.bronId) {
        setGekozenId(json.postcode.bronId);
        if (json.postcode.modus) setModus(json.postcode.modus);
      }
    } catch {
      setPostcodeAntwoord({
        status: "fout",
        tekst: "Het antwoord op uw postcode kon niet worden opgehaald. Probeer het opnieuw.",
      });
    } finally {
      setPostcodeLaden(false);
    }
  }

  useEffect(() => {
    const pc = new URLSearchParams(window.location.search).get("postcode")?.trim();
    if (!pc) return;
    setPostcode(pc);
    setGezochtePostcode(pc);
    let actief = true;
    setPostcodeLaden(true);
    setPostcodeAntwoord(null);
    (async () => {
      try {
        const res = await fetch(`/api/rookpluimen?postcode=${encodeURIComponent(pc)}`);
        const json: Antwoord & { postcode?: PostcodeAntwoord } = await res.json();
        if (!actief) return;
        setPostcodeAntwoord(json.postcode ?? null);
        if (json.postcode?.bronId) {
          setGekozenId(json.postcode.bronId);
          if (json.postcode.modus) setModus(json.postcode.modus);
        }
      } catch {
        if (actief)
          setPostcodeAntwoord({
            status: "fout",
            tekst: "Het antwoord op uw postcode kon niet worden opgehaald. Probeer het opnieuw.",
          });
      } finally {
        if (actief) setPostcodeLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  // C2: zodra de (async ladende) kaart klaar is én er een geldige postcode is
  // gezocht — ook via ?postcode= bij het opstarten — springt de kaart naar het
  // departement. Draait één keer per (kaart, postcode)-paar.
  useEffect(() => {
    if (!kaart || !gezochtePostcode) return;
    const res = departementVoorPostcode(gezochtePostcode);
    if (res.type === "ok") zoomNaarDepartement(res.departementen.map((d) => d.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaart, gezochtePostcode]);

  const startHref = (() => {
    const params = new URLSearchParams();
    if (embed) params.set("embed", "1");
    if (postcode.trim()) params.set("postcode", postcode.trim());
    const qs = params.toString();
    return qs ? `/start?${qs}` : "/start";
  })();

  const toonDekking = toonSatelliet && !!satelliet;

  return (
    <div className="omhulsel">
      <EmbedHoogte actief={embed} />
      <a className="terug-overzicht" href={startHref}>
        ← Terug naar overzicht
      </a>
      {!embed && (
        <header className="site-kop">
          <h1>Verwachte rookverplaatsing</h1>
          <p>
            Waar waait de lucht naartoe vanaf een gedetecteerde hittebron? Deze module berekent de
            windbaan — geen rookmodel.
          </p>
        </header>
      )}

      {laden && <Voortgang fasen={LAAD_FASEN} />}

      {!laden && fout && (
        <div className="sectie">
          <p className="fout-melding">{fout}</p>
        </div>
      )}

      {!laden && !fout && (
        <>
          <section className="sectie" aria-labelledby="postcode-titel">
            <h2 id="postcode-titel">Komt die rook naar mij toe?</h2>
            <p style={{ marginTop: 0 }}>
              Vul een Franse postcode in (5 cijfers). Dan berekenen we of een van de berekende
              windbanen in de komende 24 uur boven uw departement komt.
            </p>
            <form className="postcode-vorm" noValidate onSubmit={zoekPostcode}>
              <label htmlFor="rook-postcode" style={{ position: "absolute", left: "-9999px" }}>
                Franse postcode
              </label>
              <input
                id="rook-postcode"
                inputMode="numeric"
                pattern="[0-9]{5}"
                autoComplete="postal-code"
                placeholder="bijv. 11000"
                maxLength={5}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
              <button className="knop" type="submit" disabled={postcodeLaden}>
                {postcodeLaden ? "Berekenen…" : "Bekijk mijn departement"}
              </button>
            </form>
            {postcodeAntwoord && (
              <p
                className={`${styles.postcodeAntwoord} ${
                  postcodeAntwoord.status === "ok" && postcodeAntwoord.bronId ? styles.postcodeTreft : ""
                }`}
                role="status"
              >
                {postcodeUitspraak(postcodeAntwoord, gezochtePostcode, pluimen.length)}
              </p>
            )}
            {postcodeAntwoord?.status === "ok" && (
              <button
                type="button"
                className={styles.heelFrankrijk}
                onClick={toonHeelFrankrijk}
              >
                ↔ Toon weer heel Frankrijk
              </button>
            )}
          </section>

          <section className="sectie" aria-labelledby="kaart-titel">
            <h2 id="kaart-titel" style={{ marginBottom: 6 }}>
              Kaart van de berekende windbanen
            </h2>
            <p className={styles.status} aria-live="polite">
              {statusTekst(data)}
            </p>

            {data?.windBeschikbaar && (
              <p className={styles.horizon} aria-live="polite">
                <span aria-hidden="true" className={styles.horizonPunt} />
                {horizonTekst(uur)}
                {data?.startuur ? ` · ${klok(data.startuur, uur)}` : ""}
              </p>
            )}

            {/* ---- Volvlak-kaart met zwevende bediening ---- */}
            <div className={styles.kaartVlak}>
              <LeafletKaart
                className={styles.kaart}
                coöperatief={embed}
                ariaLabel="Kaart van Frankrijk met de berekende windbanen vanaf hittebronnen"
                onKaart={onKaart}
              />

              {/* Datumbanner (klein, bovenin) */}
              {toonSatelliet && satelliet && (
                <div className={styles.datumBalk}>
                  <span>NASA · {satellietDatum(satelliet.datum)}</span>
                </div>
              )}

              {/* Lagenpaneel rechtsboven */}
              <div className={styles.laagPaneel}>
                <button
                  type="button"
                  className={styles.lagenKop}
                  aria-expanded={lagenOpen}
                  aria-controls="rook-lagen"
                  onClick={() => setLagenOpen((v) => !v)}
                >
                  Lagen <span aria-hidden="true">{lagenOpen ? "▾" : "▸"}</span>
                </button>
                {lagenOpen && (
                  <div id="rook-lagen" className={styles.laagInhoud}>
                    {data?.windBeschikbaar && (
                      <div className={styles.modusRij} role="group" aria-label="Windlaag">
                        <button
                          type="button"
                          aria-pressed={modus === "leefniveau"}
                          onClick={() => setModus("leefniveau")}
                        >
                          Leefniveau
                        </button>
                        <button
                          type="button"
                          aria-pressed={modus === "ophoogte"}
                          onClick={() => setModus("ophoogte")}
                        >
                          Op hoogte
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className={styles.laagKnop}
                      aria-pressed={toonSatelliet}
                      onClick={() => setToonSatelliet((v) => !v)}
                    >
                      Satelliet — dag (NASA){toonSatelliet && satellietLaden ? " …" : ""}
                    </button>
                    {toonSatelliet && satellietFout && (
                      <span className={styles.laagFout}>satelliet nu niet beschikbaar</span>
                    )}

                    {toonDekking && (
                      <label className={styles.dekking}>
                        <span>Dekking {dekking}%</span>
                        <input
                          type="range"
                          min={20}
                          max={100}
                          step={5}
                          value={dekking}
                          onChange={(e) => setDekking(Number(e.target.value))}
                          aria-label="Dekking van het satellietbeeld"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* Onderrij: legenda + tijdschuif in één rij, zodat ze elkaar
                  nooit bedekken en de zijladerail/attributie vrij blijven. */}
              <div className={styles.onderBalk}>
                <div className={styles.legenda}>
                  {data?.windBeschikbaar && (
                    <>
                      <span>
                        <i className={styles.legGemeten} /> gemeten wind
                      </span>
                      <span>
                        <i className={styles.legVerwacht} /> verwachte wind
                      </span>
                    </>
                  )}
                  <span>
                    <i className={styles.legKegel} /> onzekerheid richting
                  </span>
                  <span>
                    <i className={styles.legBron} /> hittebron
                  </span>
                </div>

                {/* Tijdschuif: −12 (verleden) t/m +24 (vooruitblik), nu gemarkeerd */}
                {data?.windBeschikbaar && (
                  <div className={styles.tijdBalk}>
                    <span className={styles.tijdLabel}>
                      {tijdLabel(uur)}
                      {data?.startuur ? ` · ${klok(data.startuur, uur)}` : ""}
                    </span>
                    <div className={styles.schuifWrap}>
                      <span
                        className={styles.nuMerk}
                        style={{ left: `${((0 - SCHUIF_MIN) / (SCHUIF_MAX - SCHUIF_MIN)) * 100}%` }}
                        aria-hidden="true"
                      >
                        nu
                      </span>
                      <input
                        type="range"
                        min={SCHUIF_MIN}
                        max={SCHUIF_MAX}
                        step={1}
                        value={uur}
                        onChange={(e) => setUur(Number(e.target.value))}
                        aria-label="Tijdstip: van 12 uur geleden tot 24 uur vooruit"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Popup (breed scherm): eigen overlay, geklemd binnen het kaartvlak */}
              {!smal && gekozen && klikPunt && (
                <div
                  ref={popupRef}
                  className={styles.pluimPopup}
                  style={{ visibility: "hidden" }}
                  role="dialog"
                  aria-label={`Details berekende windbaan vanaf ${gekozen.bronDepartement ?? "een hittebron"}`}
                >
                  <button
                    type="button"
                    className={styles.popupSluitKruis}
                    aria-label="Sluiten"
                    onClick={() => setGekozenId(null)}
                  >
                    ×
                  </button>
                  <h3 className={styles.popupKop}>
                    Berekende windbaan vanaf {gekozen.bronDepartement ?? "een hittebron"}{" "}
                    {gekozen.bronDepartementCode ? (
                      <span className={styles.code}>{gekozen.bronDepartementCode}</span>
                    ) : null}
                  </h3>
                  <PluimDetails pluim={gekozen} />
                  <p className={styles.paneelNoot}>{PLUIM_NOOT}</p>
                  <button
                    type="button"
                    className={styles.popupSluitOnder}
                    onClick={() => setGekozenId(null)}
                  >
                    Sluiten
                  </button>
                </div>
              )}

              {/* Schuifpaneel van onderen op smalle schermen */}
              {smal && gekozen && (
                <BronSheet pluim={gekozen} onSluit={() => setGekozenId(null)} />
              )}
            </div>

            <p className={styles.kaartHint}>
              Tip: klik of tik op een hittebron of een berekende windbaan voor de details. Zoomen met de knoppen,
              dubbelklik, of shift-slepen voor een zoomkader; pannen door te slepen of met het toetsenbord
              {embed ? " (klik eerst op de kaart)" : ""}.
            </p>

          </section>

          <section className="sectie" aria-labelledby="kaders-titel">
            <h2 id="kaders-titel">Belangrijk om te weten</h2>
            <ul className={styles.kaders}>
              <li>
                <strong>Dit is geen rookmodel.</strong> Het is de berekende windbaan vanaf
                gedetecteerde hittebronnen. Werkelijke rook stijgt, mengt, slaat neer en wordt door
                neerslag uitgewassen; dat zit hier niet in.
              </li>
              <li>
                Een VIIRS-detectie is een gemeten thermische anomalie — een satellietwaarneming van
                een hittebron — en <strong>niet automatisch een door de autoriteiten bevestigde
                natuurbrand</strong>.
              </li>
              <li>
                <strong>De onzekerheid groeit met de tijd.</strong> Voorbij 12 uur is het beeld
                indicatief.
              </li>
              <li>
                De kegel toont de onzekerheid over de <strong>richting</strong>, niet de hoeveelheid
                rook.
              </li>
              <li>
                <strong>Zie je rook of vuur: bel 18 of 112</strong> (doven en slechthorenden: 114).
                Volg altijd FR-Alert en de instructies van prefectuur en mairie.
              </li>
            </ul>
          </section>

          <p className={styles.bronregel}>
            Bronnen: hittebronnen —{" "}
            <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener noreferrer">
              NASA FIRMS (VIIRS)
            </a>
            ; wind —{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
              Open-Meteo
            </a>{" "}
            (windmodel); dagelijks satellietbeeld — NASA GIBS / EOSDIS; kaart —
            © OpenStreetMap-bijdragers, tegels © CARTO.
            {data?.bijgewerkt ? ` Gegevens opgehaald: ${volledigeDatum(data.bijgewerkt)}.` : ""}
          </p>

          <footer className="site-voet">
            <p style={{ margin: 0 }}>
              <a href={embed ? "/?embed=1" : "/"}>← Terug naar Brandrisico Frankrijk</a>
            </p>
            {!embed && (
              <p style={{ margin: "8px 0 0" }}>
                <a href="https://www.nederlanders.fr/page/bosbranden">
                  Terug naar de pagina op Nederlanders.fr
                </a>
              </p>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

// ---- Postcode-uitspraak: eerlijke formulering, zonder de rekenlogica te raken ----
// De berekening (rookdrift.ts) blijft ongewijzigd; we hergebruiken alleen zijn
// uitkomsten (status, treffer-ja/nee, het al berekende km-getal uit de tekst) en
// het aantal getekende windbanen, en formuleren de zin hier opnieuw. Onderwerp is
// altijd een GEMETEN WARMTEBRON en een BEREKENDE WINDBAAN — geen bevestigde brand —
// en industriële warmtebronnen worden expliciet niet uitgesloten. Het afstandsgetal
// meet de dichtstbijzijnde berekende windbaan (zie minAfstandTotDepartementKm).
// Wikkel de formulering zo dat een onverwachte fout hier nooit de render (en
// daarmee de kaart) meesleept: bij een uitzondering tonen we een nette melding.
function postcodeUitspraak(
  antwoord: PostcodeAntwoord,
  gezochtePostcode: string,
  aantalWindbanen: number
): string {
  try {
    return postcodeUitspraakOnveilig(antwoord, gezochtePostcode, aantalWindbanen);
  } catch {
    return "De uitkomst voor deze postcode kon niet worden getoond. Probeer het opnieuw.";
  }
}

function postcodeUitspraakOnveilig(
  antwoord: PostcodeAntwoord,
  gezochtePostcode: string,
  aantalWindbanen: number
): string {
  const res = departementVoorPostcode(gezochtePostcode);
  const dep = res.type === "ok" ? res.departementen.map((d) => d.naam).join(" / ") : "uw departement";

  if (antwoord.status === "buiten-metropole") {
    return "Deze module dekt alleen Frankrijk métropole (incl. Corsica). Voor de overzeese gebieden zijn geen berekende windbanen beschikbaar.";
  }
  if (antwoord.status === "geen-pluimen") {
    return `Er zijn nu geen berekende windbanen, dus er komt niets richting ${dep}.`;
  }
  if (antwoord.status !== "ok") {
    // ongeldig / onbekend / fout: bevatten geen brand- of pluimterminologie.
    return antwoord.tekst;
  }
  if (antwoord.bronId) {
    // Treffer: één of meer windbanen komen boven het departement.
    return `Eén of meer berekende windbanen komen in de komende 24 uur boven ${dep}. Dit is een berekende windbaan vanaf een gemeten warmtebron, geen rookmodel en geen bevestigde brand. Industriële warmtebronnen worden niet uitgesloten. Volg bij een brand altijd FR-Alert en de instructies van prefectuur en mairie.`;
  }
  // Geen treffer. Hergebruik het al berekende km-getal uit de brontekst.
  const kmMatch = antwoord.tekst.match(/ongeveer\s+(\d+)\s*km/);
  const afstandZin = kmMatch
    ? ` De dichtstbijzijnde berekende windbaan ligt op ongeveer ${kmMatch[1]} km.`
    : "";
  const aanhef =
    aantalWindbanen === 1
      ? `De enige berekende windbaan komt in de komende 24 uur niet boven ${dep}.`
      : `Geen van de ${aantalWindbanen} berekende windbanen komt in de komende 24 uur boven ${dep}.`;
  return `${aanhef}${afstandZin} Let op: dit is een satellietmeting van een warmtebron, geen door de autoriteiten bevestigde brand. Industriële warmtebronnen zoals raffinaderijen en staalfabrieken worden niet uitgesloten.`;
}

// ---- Gedeelde detailinhoud (popup breed + schuifpaneel smal) ----

const PLUIM_NOOT =
  "Deze meting hoort bij een ruimtelijk en in tijd samenhangend cluster. Een cluster is geen " +
  "bevestigde natuurbrand: de filter maakt geen onderscheid tussen vegetatiebranden en vaste " +
  "industriële warmtebronnen. FRP is het geschatte uitgestraalde vermogen, niet het verbrande oppervlak.";

function PluimDetails({ pluim }: { pluim: Pluim }) {
  return (
    <div className={styles.detailGrid}>
      <span className={styles.detailLabel}>Detecties</span>
      <span>{pluim.detecties} VIIRS-detecties in dit cluster</span>
      {pluim.frp != null && (
        <>
          <span className={styles.detailLabel}>FRP (som)</span>
          <span>{formatteerGetal(pluim.frp)} MW</span>
        </>
      )}
      <span className={styles.detailLabel}>Laatste detectie</span>
      <span>{volledigeDatum(pluim.laatsteDetectie)}</span>
      <span className={styles.detailLabel}>Driftrichting</span>
      <span>{pluim.richting || "onbekend"}</span>
      <span className={styles.detailLabel}>Afgelegd (leefniveau)</span>
      <span>{pluim.kmLeefniveau} km in 24 uur</span>
      <span className={styles.detailLabel}>Afgelegd (op hoogte)</span>
      <span>{pluim.kmOphoogte} km in 24 uur</span>
    </div>
  );
}

// ---- Schuifpaneel van onderen (smalle schermen) ----

function BronSheet({ pluim, onSluit }: { pluim: Pluim; onSluit: () => void }) {
  const [sleep, setSleep] = useState(0);
  const startY = useRef(0);
  return (
    <div className={styles.sheetOverlay} onClick={onSluit}>
      <div
        className={styles.sheet}
        style={{ transform: sleep ? `translateY(${sleep}px)` : undefined }}
        role="dialog"
        aria-label={`Details berekende windbaan vanaf ${pluim.bronDepartement ?? "een hittebron"}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          startY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          const d = e.touches[0].clientY - startY.current;
          if (d > 0) setSleep(d);
        }}
        onTouchEnd={() => {
          if (sleep > 90) onSluit();
          else setSleep(0);
        }}
      >
        <div className={styles.sheetGreep} aria-hidden="true" />
        <div className={styles.sheetKop}>
          <h3>
            Berekende windbaan vanaf {pluim.bronDepartement ?? "een hittebron"}{" "}
            {pluim.bronDepartementCode ? (
              <span className={styles.code}>{pluim.bronDepartementCode}</span>
            ) : null}
          </h3>
          <button type="button" aria-label="Sluiten" onClick={onSluit}>
            ×
          </button>
        </div>
        <PluimDetails pluim={pluim} />
        <p className={styles.paneelNoot}>{PLUIM_NOOT}</p>
      </div>
    </div>
  );
}

// ---- Pluimgeometrie in geografische ruimte ----

// Bouwt de geometrie voor schuifstand `uur` (−12..+24). Eén doorlopend model,
// twee richtingen: het deel van de baan vóór nu is "gemeten" (doorgetrokken),
// het deel ná nu "verwacht" (gestippeld, met onzekerheidskegel). Een baan is pas
// zichtbaar als de bron op of vóór (nu + uur) is waargenomen (beginOffset ≤ uur).
function bouwPluimGeo(
  pluim: Pluim,
  modus: Windmodus,
  uur: number
): {
  solid: Array<[number, number]>;
  dashed: Array<[number, number]> | null;
  kegel: Array<[number, number]>;
  eind: [number, number];
} | null {
  const volledig = pluim[modus];
  if (!Array.isArray(volledig) || volledig.length < 2) return null;

  // beginOffset móét een eindig getal ≤ 0 zijn. Ontbreekt het of is het NaN
  // (bijv. een verouderde/afwijkende API-respons van vóór de tijdschuif), val
  // dan terug op 0 in plaats van NaN te laten doorlekken — anders wordt eindIndex
  // NaN en gooit volledig[NaN] verderop een fout die de hele kaart meesleept.
  const beginOffset = Number.isFinite(pluim.beginOffset)
    ? Math.min(0, pluim.beginOffset)
    : 0;
  if (uur < beginOffset) return null; // nog niet waargenomen op dit moment
  const nuIndex = -beginOffset; // index van het "nu"-punt in de baan
  const eindIndex = Math.min(volledig.length - 1, uur - beginOffset);
  if (!Number.isInteger(eindIndex) || eindIndex < 1) return null;

  // Extra vangnet: het eindpunt moet echt bestaan en twee getallen bevatten.
  const eindPunt = volledig[eindIndex];
  if (!Array.isArray(eindPunt) || eindPunt.length < 2) return null;

  const naarLatLng = (van: number, tot: number): Array<[number, number]> =>
    volledig.slice(van, tot + 1).map(([lon, lat]) => [lat, lon] as [number, number]);

  // Gemeten deel: van de bron tot nu (of tot de schuifstand, als die vóór nu ligt).
  const solidTot = Math.min(nuIndex, eindIndex);
  const solid = naarLatLng(0, solidTot);

  // Verwacht deel: van nu tot de schuifstand — alleen als die ná nu ligt.
  let dashed: Array<[number, number]> | null = null;
  let kegel: Array<[number, number]> = [];
  if (eindIndex > nuIndex) {
    const van = Math.max(0, nuIndex);
    dashed = naarLatLng(van, eindIndex);
    const halveBreedtes: number[] = [];
    let cumKm = 0;
    const toekomst = volledig.slice(van, eindIndex + 1);
    for (let i = 0; i < toekomst.length; i += 1) {
      if (i > 0) {
        cumKm += haversineKm(
          toekomst[i - 1][1],
          toekomst[i - 1][0],
          toekomst[i][1],
          toekomst[i][0]
        );
      }
      halveBreedtes.push(Math.max(8, 0.15 * cumKm));
    }
    kegel = bouwKegelGeo(dashed, halveBreedtes);
  }

  const [lonE, latE] = eindPunt;
  return { solid, dashed, kegel, eind: [latE, lonE] };
}

function tijdLabel(uur: number): string {
  if (uur === 0) return "nu";
  if (uur < 0) return `−${-uur} u`;
  return `+${uur} u`;
}

function horizonTekst(uur: number): string {
  if (uur === 0) return "Toont: nu";
  if (uur < 0) return `Toont: ${-uur} uur geleden`;
  return `Toont: verwachte positie over ${uur} uur`;
}

function bouwKegelGeo(
  punten: Array<[number, number]>,
  halveBreedtesKm: number[]
): Array<[number, number]> {
  const links: Array<[number, number]> = [];
  const rechts: Array<[number, number]> = [];
  for (let i = 0; i < punten.length; i += 1) {
    const [la, lo] = punten[i];
    const vorige = punten[Math.max(0, i - 1)];
    const volgende = punten[Math.min(punten.length - 1, i + 1)];
    const koers = bearingGraden(vorige[0], vorige[1], volgende[0], volgende[1]);
    const hw = halveBreedtesKm[i];
    links.push(verplaats(la, lo, koers - 90, hw));
    rechts.push(verplaats(la, lo, koers + 90, hw));
  }
  return [...links, ...rechts.reverse()];
}

function bearingGraden(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x) / DEG;
}

function verplaats(lat: number, lon: number, koersGraden: number, km: number): [number, number] {
  const δ = km / AARDE_KM;
  const θ = koersGraden * DEG;
  const φ1 = lat * DEG;
  const λ1 = lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 / DEG, λ2 / DEG];
}

// ---- Hulpfuncties ----

function statusTekst(data: Antwoord | null): string {
  if (!data) return "Gegevens laden…";
  if (!data.beschikbaar)
    return data.opmerking ?? "De berekende windbanen zijn tijdelijk niet beschikbaar.";
  if (data.pluimen.length === 0)
    return data.opmerking ?? "Er zijn geen berekende windbanen om te tekenen.";
  if (!data.windBeschikbaar)
    return (
      data.opmerking ?? "De hittebronnen worden getoond; de windbanen zijn tijdelijk niet beschikbaar."
    );
  const n = data.pluimen.length;
  return `${n} ${n === 1 ? "windbaan" : "windbanen"} berekend vanaf de sterkste gemeten warmtebronnen. Eén uitgestrekte brand levert meerdere oorsprongen op; industriële warmtebronnen worden niet uitgesloten.`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return AARDE_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function klok(startuur: string, urenErbij: number): string {
  const d = new Date(startuur);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCHours(d.getUTCHours() + urenErbij);
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(d);
}

function volledigeDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

function satellietDatum(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return datum;
  const vandaag = new Date();
  const dagen = Math.round(
    (Date.parse(`${isoDag(vandaag)}T00:00:00Z`) - Date.parse(`${datum}T00:00:00Z`)) / 86_400_000
  );
  const woord = dagen === 0 ? "vandaag" : dagen === 1 ? "gisteren" : dagen === 2 ? "eergisteren" : null;
  const volledig = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
  return woord ? `${woord}` : volledig;
}

function isoDag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatteerGetal(waarde: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(waarde);
}
