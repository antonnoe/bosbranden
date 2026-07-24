# Brandrisico Frankrijk

Nederlandstalige tool die het verwachte **bosbrandgevaar in Frankrijk
(métropole, incl. Corsica)** toont voor morgen (J+1) en overmorgen (J+2), per
departement — via een postcode-check en een klikbare kaart. De kaart kan ook
recente **NASA FIRMS VIIRS-satellietwaarnemingen van hittebronnen** tonen als
rustige, aanklikbare pins. Gebouwd met Next.js (App Router, TypeScript), bedoeld
voor deployment op Vercel.

## Databronnen en licenties

### Météo-France — brandrisico

Météo-France — [Météo des forêts](https://meteofrance.com/meteo-des-forets),
via de API `https://public-api.meteofrance.fr/public/DPMeteoForets/v1`
(endpoint `GET /carte/encours`, niveaus J+1 en J+2 voor alle departementen).

Geverifieerde responsstructuur (07-07-2026): puntkomma-CSV met kolommen
`reference_time;dep_code;niveau_j1;niveau_j2;dep_nom`, bijvoorbeeld
`2026-07-06T14:50:06Z;11;3;4;Aude`. De `reference_time` wordt als
updatedatum getoond. De normalisator accepteert daarnaast defensief ook
JSON-varianten, mocht Météo-France het formaat ooit wijzigen (controleer
dan `/api/debug`).

De gegevens vallen onder de **Etalab Licence Ouverte / Open Licence**. De tool
toont de bron, de datum van de laatste update en neemt de niveaus ongewijzigd
over. De Météo des forêts wordt alleen tijdens het seizoen (juni t/m september)
dagelijks gepubliceerd.

### NASA FIRMS — satellietwaarnemingen

De pinlaag gebruikt de officiële
[NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) en haalt
VIIRS-detecties op van NOAA-20, NOAA-21 en Suomi NPP. Er worden alleen
waarnemingen van de afgelopen 24 uur met nominale of hoge betrouwbaarheid
geselecteerd. Punten buiten de metropolitane Franse departementsgrenzen worden
verwijderd.

Een VIIRS-detectie is een gemeten thermische anomalie en **niet automatisch een
door de autoriteiten bevestigde natuurbrand**. De interface gebruikt daarom
consequent de termen `satellietwaarneming`, `hittebron` en `detectie`.

**Kaartgeometrie:** gegenereerd uit
[gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson)
(`departements-version-simplifiee.geojson`, afgeleid van IGN GEOFLA,
**Etalab Licence Ouverte**). Regenereren kan met `npm run generate:map`.

## Architectuur

- `app/api/danger` — serverless route voor Météo-France; 6 uur cache.
- `app/api/waarnemingen` — serverless route voor NASA FIRMS; 15 minuten cache.
  De FIRMS MAP_KEY blijft uitsluitend server-side.
- `app/api/debug` — testroute voor de Météo-France-responsstructuur.
- `lib/firms.ts` — ophalen, CSV-parsing, tijdsfilter en normalisatie van FIRMS.
- `lib/departement-punt.ts` — point-in-polygon-filter zodat alleen punten binnen
  de metropolitane Franse departementen worden getoond.
- `lib/departements.ts` — tabel van alle 96 metropolitane departementen.
- `lib/kaart-paths.ts` — gegenereerde SVG-paths per departement.

Postcode-logica: eerste 2 cijfers = departementcode; `20xxx` toont
Corse-du-Sud (2A) én Haute-Corse (2B); `97`/`98` geeft de melding dat de tool
alleen Frankrijk métropole dekt.

## Deployment op Vercel

1. Importeer deze repository in Vercel (framework: Next.js).
2. Zet bij **Settings → Environment Variables**:

   | Naam | Waarde |
   |---|---|
   | `METEOFRANCE_API_KEY` | API-key voor Météo des forêts |
   | `FIRMS_MAP_KEY` | gratis NASA FIRMS MAP_KEY |

   De Météo-France-key genereer je op
   [portail-api.meteofrance.fr](https://portail-api.meteofrance.fr).

   De FIRMS-key vraag je gratis aan via
   [NASA FIRMS Web Services](https://firms.modaps.eosdis.nasa.gov/api/area/).
   De key heeft volgens NASA een ruime transactielimiet; deze app gebruikt door
   de servercache hoogstens drie bronaanvragen per kwartier.
3. Deploy. Controleer daarna:
   - `/api/debug` — Météo-France-responsstructuur;
   - `/api/waarnemingen` — genormaliseerde FIRMS-waarnemingen;
   - `/` — de tool zelf;
   - `/?embed=1` — de embed-variant.

Zonder `FIRMS_MAP_KEY` blijft de risicokaart normaal werken en wordt de pinlaag
netjes als tijdelijk niet beschikbaar weergegeven. Er worden nooit test- of
demopinnen als live gegevens getoond.

## Embedden

De tool ondersteunt `?embed=1`: geen sitekop/-voet, compacte marges,
responsive vanaf 320px breed.

**NING 2.0**:

```html
<iframe
  src="https://JOUW-DOMEIN.vercel.app/?embed=1"
  width="750" height="1250" style="width:100%;max-width:750px;border:0;"
  loading="lazy" title="Brandrisico en satellietwaarnemingen Frankrijk">
</iframe>
```

**Infofrankrijk (WordPress/Divi)**:

```html
<div style="max-width:750px;margin:0 auto;">
  <iframe
    src="https://JOUW-DOMEIN.vercel.app/?embed=1"
    style="width:100%;border:0;height:1250px;"
    loading="lazy" title="Brandrisico en satellietwaarnemingen Frankrijk">
  </iframe>
</div>
```

## Jaarlijkse checklist

- [ ] Vóór seizoensstart: controleer de Météo-France-endpoint en `/api/debug`.
- [ ] Controleer vóór het seizoen de geldigheid van beide API-keys in Vercel.
- [ ] Controleer steekproefsgewijs prefectuur-links.
- [ ] Controleer na wijzigingen de bronvermeldingen en disclaimers.
- [ ] Controleer of NASA FIRMS de sensornamen of CSV-kolommen heeft gewijzigd.

## Lokaal ontwikkelen

```bash
npm install
METEOFRANCE_API_KEY=… FIRMS_MAP_KEY=… npm run dev
```

## Overig

- Geen analytics, cookies of advertenties; als externe frontendbron alleen
  Google Fonts (Poppins/Mulish).
- Footer linkt naar officiële preventie-informatie, Météo-France en NASA FIRMS.
- Zie je rook of vuur: bel 18 of 112 (doven/slechthorenden: 114). Volg altijd
  FR-Alert en de instructies van prefectuur en mairie.
