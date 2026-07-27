"use client";

// Rookmodule op de Leaflet-kaartschil. De zware berekening staat server-side in
// lib/rookdrift.ts; deze component tekent de pluimen, kegels, bronnen, de
// fijnstoflaag en de satellietlagen als Leaflet-lagen. De coördinaten zijn al
// lon/lat, dus ze gaan rechtstreeks de kaart in — de handmatige projectie is
// vervallen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LeafletKaart, {
  type LeafletKaartInstantie,
  type LeafletModule,
} from "@/components/kaart/LeafletKaart";
import type * as LT from "leaflet";
import Voortgang from "@/components/Voortgang";
import EmbedHoogte from "@/components/EmbedHoogte";
import styles from "@/components/Rookmodule.module.css";

const DEG = Math.PI / 180;
const AARDE_KM = 6371;

const LAAD_FASEN = [
  "Satellietwaarnemingen ophalen bij NASA FIRMS…",
  "Windveld ophalen bij Open-Meteo…",
  "Hittebronnen clusteren…",
  "Windbanen berekenen…",
];

// Pane-hoogtes: satelliet en geostationair onder de grenzen (400, uit de schil),
// fijnstof net daaronder; pluimen en bronnen erboven.
const PANE_Z: Record<string, number> = {
  satelliet: 300,
  geo: 320,
  fijnstof: 350,
  kegels: 450,
  pluimen: 460,
  bronnen: 550,
};

// GIBS als WMTS-tegellaag. {TIME} vullen we met de gekozen datum; {z}/{y}/{x}
// vult Leaflet. Let op de volgorde y vóór x, en matrixset Level9.
const GIBS_SJABLOON =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";
const EUMETSAT_WMS = "https://view.eumetsat.int/geoserver/wms";

// PM2.5-klassen (µg/m³), gelijk aan taak B. Onder de WHO-daggrens tekenen we niets.
const WHO_DAGGRENS_PM25 = 15;
const PM25_KLASSEN = [
  { min: 15, kleur: "168, 130, 195", kernAlpha: 0.5, label: "15–35", duiding: "verhoogd" },
  { min: 35, kleur: "142, 78, 168", kernAlpha: 0.62, label: "35–75", duiding: "hoog" },
  { min: 75, kleur: "108, 34, 132", kernAlpha: 0.74, label: "75–150", duiding: "zeer hoog" },
  { min: 150, kleur: "72, 12, 92", kernAlpha: 0.86, label: "≥150", duiding: "extreem" },
] as const;

function pm25KlasseIndex(waarde: number): number {
  if (!Number.isFinite(waarde) || waarde < WHO_DAGGRENS_PM25) return -1;
  for (let i = PM25_KLASSEN.length - 1; i >= 0; i -= 1) {
    if (waarde >= PM25_KLASSEN[i].min) return i;
  }
  return -1;
}

type Windmodus = "leefniveau" | "ophoogte";
type GeoLaag = "mtg_fd:rgb_dust" | "mtg_fd:frp";

interface Pluim {
  id: string;
  lat: number;
  lon: number;
  detecties: number;
  frp: number | null;
  laatsteDetectie: string;
  bronDepartement: string | null;
  bronDepartementCode: string | null;
  leefniveau: Array<[number, number]>;
  ophoogte: Array<[number, number]>;
  kmLeefniveau: number;
  kmOphoogte: number;
  richting: string;
}

interface FijnstofGridpunt {
  lat: number;
  lon: number;
  pm25: Array<number | null>;
}

interface Antwoord {
  beschikbaar: boolean;
  windBeschikbaar: boolean;
  bijgewerkt: string | null;
  startuur: string;
  opmerking?: string;
  pluimen: Pluim[];
  fijnstof?: { grid: FijnstofGridpunt[]; uren: string[] };
}

interface PostcodeAntwoord {
  status: string;
  tekst: string;
  bronId?: string;
  modus?: Windmodus;
  vroegsteUur?: number;
}

interface GeoTijden {
  beschikbaar: boolean;
  laag: string;
  laatste: string;
  reeks: string[];
}

export default function Rookmodule({ embed }: { embed: boolean }) {
  const [data, setData] = useState<Antwoord | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);

  const [uur, setUur] = useState(24);
  const [modus, setModus] = useState<Windmodus>("leefniveau");
  const [gekozenId, setGekozenId] = useState<string | null>(null);

  const [toonFijnstof, setToonFijnstof] = useState(false);
  const [fijnstof, setFijnstof] = useState<{ grid: FijnstofGridpunt[]; uren: string[] } | null>(null);
  const [fijnstofLaden, setFijnstofLaden] = useState(false);

  // NASA GIBS (dagelijks, hoge resolutie).
  const [toonSatelliet, setToonSatelliet] = useState(false);
  const [satelliet, setSatelliet] = useState<{ datum: string; laag: string } | null>(null);
  const [satellietLaden, setSatellietLaden] = useState(false);
  const [satellietFout, setSatellietFout] = useState(false);

  // EUMETSAT geostationair (elke tien minuten).
  const [toonGeo, setToonGeo] = useState(false);
  const [geoLaag, setGeoLaag] = useState<GeoLaag>("mtg_fd:rgb_dust");
  const [geoTijden, setGeoTijden] = useState<GeoTijden | null>(null);
  const [geoFrame, setGeoFrame] = useState(0);
  const [geoSpeelt, setGeoSpeelt] = useState(false);
  const [geoLaden, setGeoLaden] = useState(false);
  const [geoFout, setGeoFout] = useState(false);

  const [dekking, setDekking] = useState(70);

  const [postcode, setPostcode] = useState("");
  const [postcodeAntwoord, setPostcodeAntwoord] = useState<PostcodeAntwoord | null>(null);
  const [postcodeLaden, setPostcodeLaden] = useState(false);

  const [kaart, setKaart] = useState<{ map: LeafletKaartInstantie; L: LeafletModule } | null>(null);

  // Laag-referenties die we imperatief bijwerken in plaats van herbouwen.
  const gibsRef = useRef<LT.TileLayer | null>(null);
  const geoActiefRef = useRef<LT.TileLayer.WMS | null>(null);
  const geoVolgendRef = useRef<LT.TileLayer.WMS | null>(null);

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

  // Fijnstof pas ophalen wanneer de gebruiker de laag inschakelt.
  useEffect(() => {
    if (!toonFijnstof || fijnstof) return;
    let actief = true;
    setFijnstofLaden(true);
    (async () => {
      try {
        const res = await fetch("/api/rookpluimen?fijnstof=1");
        const json: Antwoord = await res.json();
        if (actief && json.fijnstof) setFijnstof(json.fijnstof);
      } catch {
        /* stil: laag blijft leeg, kaart blijft werken */
      } finally {
        if (actief) setFijnstofLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [toonFijnstof, fijnstof]);

  // GIBS-datum ophalen zodra de laag aangaat (alleen de datum; de tegels haalt
  // Leaflet zelf op). De terugvalketen (vandaag → vier dagen terug) zit in de API.
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

  // Tijdvenster van de geostationaire laag uit de GetCapabilities halen.
  useEffect(() => {
    if (!toonGeo) return;
    let actief = true;
    setGeoLaden(true);
    setGeoFout(false);
    (async () => {
      try {
        const res = await fetch(`/api/eumetsat-tijden?laag=${encodeURIComponent(geoLaag)}`);
        if (!res.ok) throw new Error("geen tijden");
        const j: GeoTijden = await res.json();
        if (!j.beschikbaar || !Array.isArray(j.reeks) || j.reeks.length === 0)
          throw new Error("leeg venster");
        if (actief) {
          setGeoTijden(j);
          setGeoFrame(j.reeks.length - 1); // begin bij het meest recente frame
        }
      } catch {
        if (actief) setGeoFout(true);
      } finally {
        if (actief) setGeoLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, [toonGeo, geoLaag]);

  const pluimen = useMemo(() => data?.pluimen ?? [], [data]);
  const gekozen = pluimen.find((p) => p.id === gekozenId) ?? null;

  // ---- Kaart klaar: panes aanmaken en de kaart bewaren ----
  const onKaart = useCallback((map: LeafletKaartInstantie, L: LeafletModule) => {
    for (const [naam, z] of Object.entries(PANE_Z)) {
      map.createPane(naam);
      const pane = map.getPane(naam);
      if (pane) pane.style.zIndex = String(z);
    }
    setKaart({ map, L });
  }, []);

  // ---- Pluimen (polylijn) + onzekerheidskegel (polygoon) ----
  useEffect(() => {
    if (!kaart) return;
    const { map, L } = kaart;
    const groep = L.layerGroup().addTo(map);
    if (data?.windBeschikbaar) {
      for (const pluim of pluimen) {
        const geo = bouwPluimGeo(pluim, modus, uur);
        if (!geo) continue;
        const isGekozen = pluim.id === gekozenId;
        L.polygon(geo.kegel, {
          pane: "kegels",
          color: "rgba(128,0,0,0.28)",
          weight: 1,
          fillColor: "#800000",
          fillOpacity: isGekozen ? 0.18 : 0.1,
          interactive: false,
        }).addTo(groep);
        const lijn = L.polyline(geo.latlngs, {
          pane: "pluimen",
          color: "#800000",
          weight: isGekozen ? 3 : 2,
          opacity: isGekozen ? 1 : 0.75,
          dashArray: isGekozen ? undefined : "5 6",
        });
        lijn.on("click", () => setGekozenId((h) => (h === pluim.id ? null : pluim.id)));
        lijn.addTo(groep);
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
  }, [kaart, data, pluimen, modus, uur, gekozenId]);

  // ---- Bronmarkers (toetsenbord-bereikbaar via L.marker) ----
  useEffect(() => {
    if (!kaart) return;
    const { map, L } = kaart;
    const groep = L.layerGroup().addTo(map);
    for (const pluim of pluimen) {
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
      marker.on("click", () => setGekozenId((h) => (h === pluim.id ? null : pluim.id)));
      marker.on("keypress", (e: LT.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === "Enter" || e.originalEvent.key === " ") {
          setGekozenId((h) => (h === pluim.id ? null : pluim.id));
        }
      });
      marker.addTo(groep);
    }
    return () => {
      map.removeLayer(groep);
    };
  }, [kaart, pluimen, gekozenId]);

  // ---- Fijnstoflaag ----
  useEffect(() => {
    if (!kaart || !toonFijnstof || !fijnstof) return;
    const { map, L } = kaart;
    const groep = L.layerGroup().addTo(map);
    for (const punt of fijnstof.grid) {
      const waarde = punt.pm25[Math.min(uur, punt.pm25.length - 1)];
      if (waarde == null) continue;
      const klasse = pm25KlasseIndex(waarde);
      if (klasse < 0) continue;
      const kl = PM25_KLASSEN[klasse];
      L.circle([punt.lat, punt.lon], {
        pane: "fijnstof",
        radius: 55_000,
        stroke: false,
        fillColor: `rgb(${kl.kleur})`,
        fillOpacity: kl.kernAlpha * 0.5,
        interactive: false,
      }).addTo(groep);
    }
    return () => {
      map.removeLayer(groep);
    };
  }, [kaart, toonFijnstof, fijnstof, uur]);

  // ---- GIBS-tegellaag (aanmaken/verwijderen) ----
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
    // dekking bewust buiten de deps: die past een apart effect toe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaart, toonSatelliet, satelliet]);

  // ---- EUMETSAT-lagen: actief frame + één frame vooruit voorladen ----
  useEffect(() => {
    if (!kaart || !toonGeo || !geoTijden?.reeks?.length) return;
    const { map, L } = kaart;
    const start = geoTijden.reeks[geoTijden.reeks.length - 1];
    const maak = (tijd: string, opac: number) =>
      L.tileLayer.wms(EUMETSAT_WMS, {
        layers: geoLaag,
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        // @ts-expect-error time is een geldige WMS-parameter, niet in de Leaflet-typedef
        time: tijd,
        pane: "geo",
        opacity: opac,
        attribution: "EUMETSAT",
      });
    const actief = maak(start, dekking / 100).addTo(map);
    const volgend = maak(start, 0).addTo(map); // onzichtbaar: alleen voorladen
    geoActiefRef.current = actief;
    geoVolgendRef.current = volgend;
    return () => {
      map.removeLayer(actief);
      map.removeLayer(volgend);
      geoActiefRef.current = null;
      geoVolgendRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kaart, toonGeo, geoLaag, geoTijden]);

  // Frame wisselen: actief op het huidige frame, voorlader op het volgende.
  useEffect(() => {
    const actief = geoActiefRef.current;
    const volgend = geoVolgendRef.current;
    if (!actief || !geoTijden?.reeks?.length) return;
    const reeks = geoTijden.reeks;
    actief.setParams({ time: reeks[geoFrame] } as unknown as LT.WMSParams);
    const volgendeIndex = (geoFrame + 1) % reeks.length;
    volgend?.setParams({ time: reeks[volgendeIndex] } as unknown as LT.WMSParams);
  }, [geoFrame, geoTijden]);

  // Dekking (opacity) toepassen op beide satellietlagen zonder ze te herbouwen.
  useEffect(() => {
    gibsRef.current?.setOpacity(dekking / 100);
    geoActiefRef.current?.setOpacity(dekking / 100);
  }, [dekking]);

  // Tijdlus afspelen.
  useEffect(() => {
    if (!geoSpeelt || !toonGeo || !geoTijden?.reeks?.length) return;
    const lengte = geoTijden.reeks.length;
    const id = setInterval(() => setGeoFrame((f) => (f + 1) % lengte), 800);
    return () => clearInterval(id);
  }, [geoSpeelt, toonGeo, geoTijden]);

  async function zoekPostcode(e: React.FormEvent) {
    e.preventDefault();
    setPostcodeLaden(true);
    setPostcodeAntwoord(null);
    try {
      const res = await fetch(`/api/rookpluimen?postcode=${encodeURIComponent(postcode.trim())}`);
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

  // Additief: leest ?postcode= bij het opstarten.
  useEffect(() => {
    const pc = new URLSearchParams(window.location.search).get("postcode")?.trim();
    if (!pc) return;
    setPostcode(pc);
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

  const startHref = (() => {
    const params = new URLSearchParams();
    if (embed) params.set("embed", "1");
    if (postcode.trim()) params.set("postcode", postcode.trim());
    const qs = params.toString();
    return qs ? `/start?${qs}` : "/start";
  })();

  const toonDekking = (toonSatelliet && !!satelliet) || (toonGeo && !!geoTijden);

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
          {/* ---------- Postcode-antwoord ---------- */}
          <section className="sectie" aria-labelledby="postcode-titel">
            <h2 id="postcode-titel">Komt die rook naar mij toe?</h2>
            <p style={{ marginTop: 0 }}>
              Vul een Franse postcode in (5 cijfers). Dan berekenen we of een van de pluimen in de
              komende 24 uur boven uw departement komt.
            </p>
            <form className="postcode-vorm" onSubmit={zoekPostcode}>
              <label htmlFor="rook-postcode" style={{ position: "absolute", left: "-9999px" }}>
                Franse postcode
              </label>
              <input
                id="rook-postcode"
                inputMode="numeric"
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
                  postcodeAntwoord.status === "ok" && postcodeAntwoord.bronId
                    ? styles.postcodeTreft
                    : ""
                }`}
                role="status"
              >
                {postcodeAntwoord.tekst}
              </p>
            )}
          </section>

          {/* ---------- Kaart ---------- */}
          <section className="sectie" aria-labelledby="kaart-titel">
            <h2 id="kaart-titel" style={{ marginBottom: 6 }}>
              Kaart van de pluimen
            </h2>
            <p className={styles.status} aria-live="polite">
              {statusTekst(data)}
            </p>

            {/* ---------- Bediening ---------- */}
            {data?.windBeschikbaar && (
              <div className={styles.bediening}>
                <div className={styles.laagKnoppen} role="group" aria-label="Kies de laag">
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
                <p className={styles.laagUitleg}>
                  {modus === "leefniveau"
                    ? "Leefniveau volgt de wind vlak boven de grond — bepalend voor stanklast dichtbij de bron."
                    : "Op hoogte stijgt de pluim mee met het 850 hPa-transportveld — bepalend voor verplaatsing over grotere afstand."}
                </p>

                <label className={styles.tijdSchuif}>
                  <span>
                    Tijd: <strong>{uur === 0 ? "nu" : `+${uur} uur`}</strong>
                    {data?.startuur ? ` (${klok(data.startuur, uur)})` : ""}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={uur}
                    onChange={(e) => setUur(Number(e.target.value))}
                    aria-label="Aantal uren dat de pluimen doorgroeien"
                  />
                </label>

                <label className={styles.fijnstofSchakel}>
                  <input
                    type="checkbox"
                    checked={toonFijnstof}
                    onChange={(e) => setToonFijnstof(e.target.checked)}
                  />
                  Fijnstoflaag tonen (CAMS PM2.5)
                  {toonFijnstof && fijnstofLaden ? " — laden…" : ""}
                </label>

                <label className={styles.fijnstofSchakel}>
                  <input
                    type="checkbox"
                    checked={toonSatelliet}
                    onChange={(e) => setToonSatelliet(e.target.checked)}
                  />
                  Satellietbeeld — dagelijks (NASA)
                  {toonSatelliet && satellietLaden ? " — laden…" : ""}
                  {toonSatelliet && satellietFout ? " — nu niet beschikbaar" : ""}
                </label>

                <label className={styles.fijnstofSchakel}>
                  <input
                    type="checkbox"
                    checked={toonGeo}
                    onChange={(e) => {
                      setToonGeo(e.target.checked);
                      if (!e.target.checked) setGeoSpeelt(false);
                    }}
                  />
                  Geostationair beeld — elke 10 min (EUMETSAT)
                  {toonGeo && geoLaden ? " — laden…" : ""}
                  {toonGeo && geoFout ? " — nu niet beschikbaar" : ""}
                </label>

                {toonGeo && geoTijden && (
                  <div className={styles.geoBediening}>
                    <div className={styles.laagKnoppen} role="group" aria-label="Kies de geostationaire laag">
                      <button
                        type="button"
                        aria-pressed={geoLaag === "mtg_fd:rgb_dust"}
                        onClick={() => setGeoLaag("mtg_fd:rgb_dust")}
                      >
                        Stof &amp; rook
                      </button>
                      <button
                        type="button"
                        aria-pressed={geoLaag === "mtg_fd:frp"}
                        onClick={() => setGeoLaag("mtg_fd:frp")}
                      >
                        Brandintensiteit
                      </button>
                    </div>
                    <div className={styles.tijdlus}>
                      <button
                        type="button"
                        className={styles.speelKnop}
                        onClick={() => setGeoSpeelt((s) => !s)}
                        aria-pressed={geoSpeelt}
                      >
                        {geoSpeelt ? "⏸ Pauze" : "▶ Afspelen"}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={geoTijden.reeks.length - 1}
                        step={1}
                        value={geoFrame}
                        onChange={(e) => {
                          setGeoSpeelt(false);
                          setGeoFrame(Number(e.target.value));
                        }}
                        aria-label="Tijdstip geostationair beeld"
                      />
                    </div>
                    <p className={styles.geoTijd}>
                      Beeld van <strong>{geoFrameTijd(geoTijden.reeks[geoFrame])}</strong> (Franse
                      tijd, UTC-gebaseerd).
                    </p>
                  </div>
                )}

                {toonDekking && (
                  <label className={styles.tijdSchuif}>
                    <span>Dekking satellietbeeld: {dekking}%</span>
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

            <LeafletKaart
              className={styles.kaart}
              ariaLabel="Kaart van Frankrijk met de berekende windbanen vanaf hittebronnen"
              onKaart={onKaart}
            />

            {toonSatelliet && satelliet && (
              <p className={styles.satellietBanner}>
                <strong>Satellietbeeld (waarneming) van {satellietDatum(satelliet.datum)}.</strong>{" "}
                Dit toont waar de rook wás; de pluimen zijn een berekende verwachting van waar de
                lucht náártoe waait. Bron: NASA GIBS / EOSDIS · {satelliet.laag}.
              </p>
            )}
            {toonSatelliet && satellietFout && !satellietLaden && (
              <p className={styles.satellietBanner}>
                Er is de afgelopen dagen geen bruikbaar satellietbeeld beschikbaar.
              </p>
            )}
            {toonGeo && geoTijden && (
              <p className={styles.satellietBanner}>
                <strong>Geostationair beeld (EUMETSAT), elke tien minuten ververst.</strong> Onze
                hittebronnen komen van poolsatellieten die maar enkele keren per etmaal overkomen; een
                brand die &apos;s nachts begint en &apos;s ochtends geblust is, valt daar zomaar
                tussenuit. Deze laag kijkt continu en dicht dat gat. Bron: EUMETSAT.
              </p>
            )}

            <p className={styles.kaartHint}>
              Tip: klik of tik op een hittebron of een pluim voor de details (bron, aantal
              detecties, driftrichting en afgelegde afstand). Zoomen en pannen met de knoppen, slepen
              of het toetsenbord (klik eerst op de kaart).
            </p>

            {/* ---------- Legenda ---------- */}
            <div className={styles.legenda}>
              <span>
                <i className={styles.legKegel} /> kegel = onzekerheid over de richting, niet de
                hoeveelheid rook
              </span>
              <span>
                <i className={styles.legBron} /> gedetecteerde hittebron
              </span>
            </div>

            {toonFijnstof && (
              <div className={styles.fijnstofLegenda}>
                <span className={styles.fijnstofLegendaTitel}>Fijnstof PM2.5 (µg/m³):</span>
                <div className={styles.fijnstofBanden}>
                  {PM25_KLASSEN.map((k, i) => (
                    <span key={`leg-${i}`} className={styles.fijnstofBand}>
                      <i style={{ background: `rgb(${k.kleur})` }} /> {k.label}
                      <em> ({k.duiding})</em>
                    </span>
                  ))}
                </div>
                <p className={styles.fijnstofRefwaarde}>
                  Onder de <strong>WHO-daggrens van 15 µg/m³</strong> wordt niets getekend (schone
                  lucht). De kleur wordt donkerder naarmate de concentratie stijgt.
                </p>
                <p className={styles.copernicus}>
                  Fijnstoflaag: gegenereerd met Copernicus Atmosphere Monitoring Service-informatie
                  2026 (CAMS European air quality, via Open-Meteo).
                </p>
              </div>
            )}

            {gekozen && (
              <PluimPaneel
                pluim={gekozen}
                onSluit={() => setGekozenId(null)}
              />
            )}
          </section>

          {/* ---------- Verplichte tekstkaders ---------- */}
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
            ; wind en fijnstof —{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
              Open-Meteo
            </a>{" "}
            (windmodel; fijnstof uit CAMS/Copernicus); dagelijks satellietbeeld — NASA GIBS / EOSDIS;
            geostationair beeld — EUMETSAT; kaart — © OpenStreetMap-bijdragers, tegels © CARTO.
            {data?.bijgewerkt ? ` Gegevens opgehaald: ${volledigeDatum(data.bijgewerkt)}.` : ""}
          </p>

          <footer className="site-voet">
            <p style={{ margin: 0 }}>
              <a href={embed ? "/?embed=1" : "/"}>← Terug naar Brandrisico Frankrijk</a>
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

// ---- Detailpaneel van een gekozen pluim ----

function PluimPaneel({ pluim, onSluit }: { pluim: Pluim; onSluit: () => void }) {
  return (
    <div className="dep-paneel" aria-live="polite">
      <div className="paneel-kop">
        <h3>
          Pluim vanaf {pluim.bronDepartement ?? "een hittebron"}{" "}
          {pluim.bronDepartementCode ? (
            <span className="dep-code">{pluim.bronDepartementCode}</span>
          ) : null}
        </h3>
        <button type="button" className="paneel-sluit" aria-label="Paneel sluiten" onClick={onSluit}>
          ×
        </button>
      </div>
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
      <p className={styles.paneelNoot}>
        Een cluster van detecties is één brandhaard, niet één brand per detectie. FRP is het
        geschatte uitgestraalde vermogen en zegt niets over het verbrande oppervlak.
      </p>
    </div>
  );
}

// ---- Pluimgeometrie in geografische ruimte ----

// Bouwt de polylijn (lat/lon) en de onzekerheidskegel (polygoon) voor de gekozen
// modus tot en met het gekozen uur.
function bouwPluimGeo(
  pluim: Pluim,
  modus: Windmodus,
  uur: number
): { latlngs: Array<[number, number]>; kegel: Array<[number, number]>; eind: [number, number] } | null {
  const volledig = pluim[modus];
  const n = Math.min(uur, volledig.length - 1) + 1;
  const gesneden = volledig.slice(0, n); // [lon, lat]
  if (gesneden.length < 2) return null;

  const latlngs = gesneden.map(([lon, lat]) => [lat, lon] as [number, number]);

  // Halve breedte per punt = max(8 km, 0,15 × afgelegde afstand).
  const halveBreedtes: number[] = [];
  let cumKm = 0;
  for (let i = 0; i < gesneden.length; i += 1) {
    if (i > 0) {
      cumKm += haversineKm(gesneden[i - 1][1], gesneden[i - 1][0], gesneden[i][1], gesneden[i][0]);
    }
    halveBreedtes.push(Math.max(8, 0.15 * cumKm));
  }

  return { latlngs, kegel: bouwKegelGeo(latlngs, halveBreedtes), eind: latlngs[latlngs.length - 1] };
}

// Bouwt een kegelpolygoon door elk middenlijnpunt loodrecht op de lokale richting
// naar links en rechts te verplaatsen over de opgegeven halve breedte in km.
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
  if (!data.beschikbaar) return data.opmerking ?? "De pluimen zijn tijdelijk niet beschikbaar.";
  if (data.pluimen.length === 0) return data.opmerking ?? "Er zijn geen pluimen om te tekenen.";
  if (!data.windBeschikbaar)
    return (
      data.opmerking ??
      "De hittebronnen worden getoond; de windbanen zijn tijdelijk niet beschikbaar."
    );
  const n = data.pluimen.length;
  return `${n} ${n === 1 ? "pluim" : "pluimen"} berekend vanaf de grootste gedetecteerde hittebronnen. Een groot brandcomplex krijgt meerdere oorsprongen langs de vuurlijn.`;
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

function geoFrameTijd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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

// Datum van het GIBS-beeld (YYYY-MM-DD) in gewone taal.
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
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return woord ? `${woord} (${volledig})` : volledig;
}

function isoDag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatteerGetal(waarde: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(waarde);
}
