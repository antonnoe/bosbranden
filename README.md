# Brandrisico Frankrijk

Nederlandstalige tool die het verwachte **bosbrandgevaar in Frankrijk
(métropole, incl. Corsica)** toont voor morgen (J+1) en overmorgen (J+2), per
departement — via een postcode-check en een klikbare kaart. Gebouwd met
Next.js (App Router, TypeScript), bedoeld voor deployment op Vercel.

## Databron en licentie

**Enige databron:** Météo-France — [Météo des forêts](https://meteofrance.com/meteo-des-forets),
via de API `https://public-api.meteofrance.fr/public/DPMeteoForets/v1`
(endpoint `GET /carte/encours`, niveaus J+1 en J+2 voor alle departementen).

De gegevens vallen onder de **Etalab Licence Ouverte / Open Licence**. Die
licentie brengt drie verplichtingen mee, die deze tool als volgt naleeft:

1. **Bronvermelding** — "Bron: Météo-France — Météo des forêts" staat met
   hyperlink op elke weergave (postcoderesultaat én kaart).
2. **Datum van laatste update** — de productie-/updatedatum uit de
   API-respons wordt bij elke weergave getoond.
3. **Geen verminking van de data** — niveaus worden 1-op-1 overgenomen,
   nooit herberekend, afgerond of anders gelabeld dan de bron. De vier
   risicokleuren zijn de officiële Météo-France-kleuren.

De Météo des forêts wordt alleen tijdens het seizoen (juni t/m september)
dagelijks rond 17.00 uur gepubliceerd. Buiten het seizoen toont de tool een
nette melding dat er geen gegevens beschikbaar zijn.

**Kaartgeometrie:** gegenereerd uit
[gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson)
(`departements-version-simplifiee.geojson`, afgeleid van IGN GEOFLA,
eveneens **Etalab Licence Ouverte**). Regenereren kan met
`npm run generate:map`.

## Architectuur

- `app/api/danger` — serverless route die `/carte/encours` ophaalt met de
  API-key in de `apikey`-header, **6 uur cachet** (Next.js `revalidate`) en
  normaliseert naar `{ niveaus: { "01": { j1, j2 }, … }, bijgewerkt }`.
  De frontend praat uitsluitend met deze route; de API-key komt nooit in
  clientcode of in de repo.
- `app/api/debug` — testroute die de werkelijke responsstructuur van
  Météo-France rapporteert (structuurschets: sleutels, types, 2
  voorbeelditems per array). Handig bij een API-wijziging.
- `lib/departements.ts` — statische tabel van alle 96 metropolitane
  departementen met code, naam en prefectuur-URL
  (patroon `https://www.<slug>.gouv.fr`; enige afwijking: Paris/75 →
  `prefectures-regions.gouv.fr/ile-de-france`).
- `lib/kaart-paths.ts` — gegenereerde SVG-paths per departement
  (`data-dep`-attribuut = departementcode).

Postcode-logica: eerste 2 cijfers = departementcode; `20xxx` toont
Corse-du-Sud (2A) én Haute-Corse (2B); `97`/`98` geeft de melding dat de
tool alleen Frankrijk métropole dekt.

## Deployment op Vercel

1. Importeer deze repository in Vercel (framework: Next.js, geen extra
   instellingen nodig).
2. Zet bij **Settings → Environment Variables**:

   | Naam | Waarde |
   |---|---|
   | `METEOFRANCE_API_KEY` | de API-key van het Météo-France-portaal |

   De key genereer je op [portail-api.meteofrance.fr](https://portail-api.meteofrance.fr)
   bij de API "Météo des forêts" (DPMeteoForets) via *API Key → Generate key*.
3. Deploy. Controleer daarna:
   - `https://<jouw-domein>/api/debug` — laat de responsstructuur zien;
   - `https://<jouw-domein>/` — de tool zelf;
   - `https://<jouw-domein>/?embed=1` — de embed-variant.

## Embedden

De tool ondersteunt `?embed=1`: geen sitekop/-voet, compacte marges,
responsive vanaf 320px breed.

**NING 2.0** (HTML-blok):

```html
<iframe
  src="https://JOUW-DOMEIN.vercel.app/?embed=1"
  width="750" height="1450" style="width:100%;max-width:750px;border:0;"
  loading="lazy" title="Brandrisico Frankrijk — Météo des forêts">
</iframe>
```

**Infofrankrijk (WordPress/Divi)** — voeg een *Code*-module toe met:

```html
<div style="max-width:750px;margin:0 auto;">
  <iframe
    src="https://JOUW-DOMEIN.vercel.app/?embed=1"
    style="width:100%;border:0;height:1450px;"
    loading="lazy" title="Brandrisico Frankrijk — Météo des forêts">
  </iframe>
</div>
```

Tip: pas `height` aan als je huisstijl meer of minder ruimte nodig heeft;
de inhoud groeit mee vanaf 320px breedte.

## Jaarlijkse checklist

- [ ] **Vóór seizoensstart (begin april):** controleer op
      [portail-api.meteofrance.fr](https://portail-api.meteofrance.fr) of de
      endpointversie (`/DPMeteoForets/v1`) nog actueel is en bekijk
      `/api/debug` of de responsstructuur ongewijzigd is.
- [ ] **07-07-2027: de API-key vervalt.** Genereer op het portaal een nieuwe
      key en werk `METEOFRANCE_API_KEY` in Vercel bij (daarna redeployen of
      wachten tot de cache van 6 uur verloopt).
- [ ] Steekproef: kloppen de prefectuur-links nog? (De rijksoverheid wijzigt
      soms domeinen; het patroon is `www.<departement>.gouv.fr`.)
- [ ] Controleer de licentieverplichtingen (bronvermelding, updatedatum,
      geen bewerking van de data) na eventuele UI-wijzigingen.

## Lokaal ontwikkelen

```bash
npm install
METEOFRANCE_API_KEY=… npm run dev
```

Zonder key blijft de site werken; `/api/danger` geeft dan een nette
foutmelding en de kaart kleurt grijs ("geen gegevens").

## Overig

- Geen analytics, geen cookies; als externe bron alleen Google Fonts
  (Poppins/Mulish).
- Footer linkt naar [feux-foret.gouv.fr](https://feux-foret.gouv.fr)
  ("Officiële preventie-informatie").
- Disclaimer op elke weergave: de Météo des forêts toont het **verwachte
  gevaarniveau**, geen actuele branden. Zie je rook of vuur: bel 18 of 112
  (doven/slechthorenden: 114). Volg bij een brand altijd FR-Alert en de
  instructies van prefectuur en mairie.
