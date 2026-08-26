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

### FR-Alert — laatste officiële meldingen (en de zwakke schakel)

De laag "Laatste officiële meldingen" leest de publieke pagina
`fr-alert.gouv.fr/les-alertes` uit (HTML-scrape) en valt bij storing terug op de
laatst bekende export in `data/fr-alert-fallback.ts`. FR-Alert is een pushsysteem
naar telefoons; de publicatie op de website loopt tijdens een crisis achter.
Daarom toont de laag **altijd de meest recente meldingen** (lopend én beëindigd),
met bij elk item de status (loopt / beëindigd op &lt;datum&gt;) en met één vaste
regel erboven: dat FR-Alert met vertraging publiceert en geen actuele
brandenlijst is, plus het tijdstip van de laatst gepubliceerde melding uit de
data. Er is dus geen misleidende "geen actuele melding" meer. Als de live bron
niet uitleesbaar is, meldt de route dat via `liveBron: false` en
`momentopnameVan`, en toont de interface dat het om de laatst bekende stand gaat.

> **Zwakste schakel.** Het uitlezen van één overheidspagina via een HTML-scrape
> is de kwetsbaarste schakel: verandert de opmaak, of hapert die ene pagina, dan
> valt de hele laag terug op de laatste momentopname. Daarom hoort de
> **Météo-France DPVigilance-API** (een echte API; de key staat al in Vercel) hoog
> op de lijst als redundante tweede bron, zodat de laag niet afhankelijk is van
> het scrapen van één pagina.

**Certificaatketen (opgelost, ter documentatie).** De live fetch faalde op
productie met `UNABLE_TO_VERIFY_LEAF_SIGNATURE`: `fr-alert.gouv.fr` stuurt het
intermediate niet mee. Het ontbrekende intermediate is **Certigna Services CA**
(O = DHIMYOTIS), uitgegeven door **Certigna Root CA**, die al in de Node-roots
zit. `lib/fr-alert-tls.ts` haalt dat intermediate nu zelf op via de AIA-URL uit
het leaf-certificaat (`.../servicesca_rootca.der` — ondanks "rootca" in de
bestandsnaam is dat het **intermediate**, kale DER) en voegt het toe aan een
`https.Agent` die alleen voor de FR-Alert-fetches wordt gebruikt. Het
leaf-certificaat verloopt **19 augustus 2026**, dus AIA blijft primair (een
hardgecodeerde PEM zou dan verlopen). De diagnose-endpoints die dit hebben
uitgewezen zijn verwijderd; de oplossing in `lib/fr-alert-tls.ts` is
productiecode. De staleness is beantwoord: er was niets nieuwer dan 24 juli — dat
is geen limietprobleem, dus `MAX_DETAILPAGINAS` is bewust niet verhoogd.

## Architectuur

- `app/api/danger` — serverless route voor Météo-France; 6 uur cache.
- `app/api/waarnemingen` — serverless route voor NASA FIRMS; 15 minuten cache.
  De FIRMS MAP_KEY blijft uitsluitend server-side.
- `app/api/rookpluimen` — serverless route voor de rookmodule (zie hieronder);
  pluimen 15 minuten, wind 30 minuten cache. Elke bron faalt afzonderlijk; de
  route geeft nooit een 500.
- `app/api/debug` — testroute voor de Météo-France-responsstructuur.
- `lib/firms.ts` — ophalen, CSV-parsing, tijdsfilter en normalisatie van FIRMS.
- `lib/rookdrift.ts` — alle server-side rekenwerk van de rookmodule: clusteren
  van FIRMS-detecties, windveld-interpolatie, trajectintegratie en het
  postcode-antwoord.
- `lib/departement-punt.ts` — point-in-polygon-filter zodat alleen punten binnen
  de metropolitane Franse departementen worden getoond.
- `lib/departements.ts` — tabel van alle 96 metropolitane departementen.
- `lib/kaart-paths.ts` — gegenereerde SVG-paths per departement. **Nog uitsluitend
  in gebruik door de brandkaart (`/`, `FranceKaart`)**; de rookmodule is naar
  Leaflet gemigreerd en gebruikt deze niet meer.
- `lib/kaart-projectie.ts` — de equirectangulaire projectie en de inverse.
  Idem: alleen nog voor de brandkaart. Niet verwijderen zolang `FranceKaart` de
  handgemaakte SVG-kaart gebruikt.
- `components/kaart/LeafletKaart.tsx` — generieke, hergebruikbare Leaflet-schil
  (init, opruimen, resize, basiskaart, departementsgrenzen, begrenzing op
  Frankrijk). Bevat geen rook-/brand-/FIRMS-logica; datalagen komen van de ouder
  via de `onKaart`-callback. De brandkaart migreert later naar dezelfde schil.
- `public/departementen.geojson` — departementsgrenzen voor de Leaflet-schil
  (`L.geoJSON`), buiten de JS-bundle gehouden en per fetch geladen.
- `app/api/satellietbeeld` — NASA GIBS. `?meta=1` geeft alleen de gekozen datum
  als JSON (voor de Leaflet-tegellaag); zonder parameter nog het gestikte beeld.

## Rookmodule (`/rook`)

De rookmodule toont **de berekende windbaan vanaf gedetecteerde hittebronnen**
— nadrukkelijk geen rookmodel. Detecties worden geclusterd uit FIRMS/VIIRS
(korte koppelafstand van 5 km); een front breder dan ~25 km wordt in een raster
gesplitst zodat een groot brandcomplex (zoals Gironde/Landes) **meerdere
pluimoorsprongen langs de vuurlijn** krijgt in plaats van één punt. De cap is
per departement (maximaal 8) met een ruim landelijk maximum (25), zodat één ramp
de kaart niet volledig inneemt en andere departementen zichtbaar blijven. Per
pluim wordt met het windveld van
[Open-Meteo](https://open-meteo.com/) (0,75°-grid, keyloos) een 24-uurstraject
geïntegreerd, in twee modi:

- **leefniveau** — uitsluitend het 10m-wind (stanklast dichtbij de bron);
- **op hoogte** — met pluimstijging naar het 850hPa-transportveld
  (`w850 = min(0,70, t / 8)`; transport over grotere afstand).

De windrichting is meteorologisch (waar de wind vandaan komt); de
transportrichting is `richting + 180`. De componenten `u`/`v` worden bilineair
geïnterpoleerd, nooit de richting in graden. De client krijgt alleen de compacte
uitgerekende pluimen (circa 14 kB), nooit het volledige windveld.

Het postcode-antwoord toetst per uurstap of het midden van een traject binnen het
departement van de bezoeker valt en meldt het vroegste uur, de bron en de modus —
of anders de minimale afstand tot dat departement.

### Kaartschil (Leaflet) en satellietlaag

De rookmodule tekent sinds taak D op een echte kaartbibliotheek in plaats van een
handgemaakte SVG-kaart. Pannen, zoomen en tegellagen zijn opgeloste problemen die
we niet zelf willen onderhouden. De brandkaart (`/`) migreert in een latere ronde
naar dezelfde schil; tot dan blijft die op de SVG-kaart.

**Leaflet is de eerste runtime-dependency buiten React en Next** (`leaflet` 1.9.4,
`@types/leaflet`). Bewust géén `react-leaflet`: dat koppelt aan React-versies en
levert hier niets op. Leaflet wordt rechtstreeks in een `useEffect` gebruikt, met
een dynamische `import("leaflet")` (client-only) en opruimen in de teardown; de
bundel (~145 kB, ~42 kB gzip) laadt lui, alleen wanneer de kaart mount. Houd dit
een bewuste uitzondering — geen precedent voor losse dependencies.

**Basiskaart:** CARTO *light_all*
(`https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`), een lichte,
gedempte ondergrond zodat de datalagen leesbaar blijven. Verplichte attributie
staat in de kaart: *© OpenStreetMap-bijdragers, tegels © CARTO*.
Gebruiksvoorwaarden: de kaartgegevens vallen onder de
[ODbL van OpenStreetMap](https://www.openstreetmap.org/copyright); de tegels
worden geleverd door [CARTO](https://carto.com/attributions) onder hun
basemap-voorwaarden (attributie verplicht). We gebruiken bewust CARTO en **niet**
de directe OSM-tegelserver (`tile.openstreetmap.org`), omdat de
[OSM-tegelgebruiksvoorwaarden](https://operations.osmfoundation.org/policies/tiles/)
zwaar productiegebruik ontmoedigen. Wisselen naar de OSM-server kan technisch
(zelfde `{z}/{x}/{y}`-schema), maar alleen bij laag verkeer en met hun attributie.

**Satellietlaag** (optioneel schakelbaar, onder de departementsgrenzen):

- **NASA GIBS** — dagelijks, hoge resolutie, als WMTS-tegellaag
  (`VIIRS_NOAA20_CorrectedReflectance_TrueColor`, matrixset
  `GoogleMapsCompatible_Level9`, volgorde `{z}/{y}/{x}`). De datum komt uit
  `/api/satellietbeeld?meta=1`, met de bestaande terugvalketen (vandaag, anders
  gisteren, tot vier dagen terug). De datum staat zichtbaar bij de kaart.
  Attributie: *NASA GIBS / EOSDIS*. Een dekkingsschuif regelt de doorzichtigheid.

**Wat er niet in zit:** geen 3D, geen deeltjesanimatie van de wind, geen
weermodellen. Dat is het terrein van partijen met een team; onze meerwaarde zit in
de Nederlandse uitleg, het antwoord per postcode, het officiële Franse
gevaarniveau en de verantwoording.

### EFFIS als kandidaat voor een latere brandmodule

Buiten scope hier, maar verkend en werkend bevonden: **EFFIS** (Copernicus CEMS),
een WMS zonder key. WMS 1.3.0, bbox in `lat,lon`-volgorde, met een verplichte
`time`-parameter. Bruikbare lagen: `mf010.fwi` (Fire Weather Index), `all.hs` en
`viirs.hs` (hotspots) en `effis.nrt.ba` (perimeters van verbrand oppervlak).
Kandidaat voor een aparte brandmodule; in deze module is er niets van gebouwd.

Postcode-logica: eerste 2 cijfers = departementcode; `20xxx` toont
Corse-du-Sud (2A) én Haute-Corse (2B); `97`/`98` geeft de melding dat de tool
alleen Frankrijk métropole dekt.

## Nieuwslade (zijlade → tab "Nieuws")

De uitschuifbare zijlade heeft naast de kaart een tab **Nieuws** met automatisch
opgehaald Frans nieuws over brandrisico. Volledig automatisch: er is geen
handmatige stap, geen redactie en geen knop om iets te publiceren.

### Hoe het loopt

`data/nieuwsbronnen.ts` (de enige toegestane bronnenlijst, `actief: true`)
  → `/api/nieuws` haalt elke actieve feed op (RSS 2.0 én Atom)
  → drie poorten: host-allowlist, datumpoort (7 dagen), **onderwerpzeef**
  → twee groepen (officieel boven, pers eronder), hooguit 8 per groep
  → Nederlandse samenvatting per artikel via de samenvatdienst
  → `components/Nieuws.tsx` toont het en ververst zichzelf.

### De onderwerpzeef (`lib/nieuws-thema.ts`)

De persfeeds zijn algemene *faits divers*-feeds. Het oorspronkelijke filter liet
een kop door zodra er ergens "incendie" of "pompiers" in stond, en dat is te
grof: op 26-08-2026 stonden er onder meer een vechtpartij in Monflanquin, twee
uitgebrande auto's in Nîmes en een ziekenhuisbrand in Islamabad in de lade.

De zeef is nu een expliciete laag met één regel:

> Een kop komt door als hij een **kernterm** bevat, óf een **steunterm** samen
> met een **natuurterm** — en daarna niet sneuvelt op de faits-divers-laag of de
> buitenland-laag.

- **Kerntermen** zijn ondubbelzinnig: `feu de forêt`, `météo des forêts`,
  `débroussaillement`, `sécheresse`, `canicule`, `qualité de l'air`,
  `arrêté préfectoral`, `zone sinistrée`, `fermeture de la chasse`, …
  Zo'n term is alleen al genoeg.
- **Steuntermen** zijn brandwoorden die óók bij een schuurbrand of een autobrand
  voorkomen: `incendie`, `feu`, `flammes`, `fumée`, `pompiers`, `évacuation`.
  Die tellen pas mee met een **natuurterm** erbij (`forêt`, `végétation`,
  `broussailles`, `garrigue`, `maquis`, `pinède`, `dune`, `camping`, …).
- **Faits-divers-laag**: misdaad en losse ongevallen eruit. Eén uitzondering: een
  kernterm redt de kop, zodat *"Incendie de forêt : un homme en garde à vue"*
  blijft staan.
- **Buitenland-laag**: landen, inwonersnamen én hoofdsteden, Frans en
  Nederlands. Redding alleen als de kop Frankrijk noemt.

Overgenomen uit [`antonnoe/nlfr-menu`](https://github.com/antonnoe/nlfr-menu)
(`lib/config.js` + `lib/feeds.js`), maar bewust **niet** één op één. Drie
verschillen, omdat deze tool een engere scope heeft:

| | nlfr-menu | deze tool |
| --- | --- | --- |
| `incendie` | insluitterm die altijd wint | steunterm; telt alleen mét natuurcontext |
| onderwerppoort | negatief (alles mag, behalve…) | positief (moet aantoonbaar over het onderwerp gaan) |
| buitenlandredding | Frankrijk, Nederland én de EU | alleen Frankrijk |

**Bij twijfel eruit.** De zeef wordt niet opgerekt om de lade vol te krijgen. Is
er niets, dan meldt de lade dat er niets binnen zeven dagen over dit onderwerp
is verschenen — een lege lade met een nette melding is beter dan vervuiling.
In de sectie **Bronnen** onderaan het nieuws staat per bron hoeveel items de
zeef tegenhield ("… buiten onderwerp"), zodat zichtbaar is of de zeef werkt of
dat de feeds stilliggen.

### Bronnen aan- en uitzetten

Elke bron heeft `actief`. Een bron waarvan de feed is verdwenen zetten we op
`false` in plaats van hem te verwijderen: de regel blijft staan met de reden
erbij, zodat niemand later opnieuw uitzoekt wat al bekend is, en weer aanzetten
één woord is. De route haalt alleen actieve bronnen op, en de host-allowlist
wordt uit diezelfde verzameling opgebouwd — een uitgezette bron houdt dus geen
domein open.

**Stand van 26-08-2026.** Van de dertien bronnen werkten er nog twee. Drie
France 3-feeds bleken alleen verhuisd van `/rss.xml` naar `/rss` en zijn
hersteld; zeven bronnen leverden op geen enkel getest adres nog een feed en
staan uit, elk met de reden op de regel zelf. Actief zijn nu: Atmo
Nouvelle-Aquitaine (geldige feed, op dit moment leeg), France 3
Nouvelle-Aquitaine, France 3 PACA, France 3 Paris Île-de-France, Sud Ouest en
Midi Libre. De préfecture de la Gironde — de waardevolste bron voor deze tool —
biedt geen feed meer aan; officiële waarschuwingen lopen intussen via
`/api/fr-alert`.

### Bronstatus lezen

Elke bron toont een van vier toestanden. Ze zijn met opzet uit elkaar getrokken:
"geslaagd" alléén verborg dat een URL wél bestaat maar geen feed teruggeeft.

| toestand | betekenis | wat te doen |
| --- | --- | --- |
| `geslaagd` | feed werkt en leverde items binnen zeven dagen | niets |
| `niets binnen 7 dagen` | feed werkt, maar publiceert weinig | niets; normaal bij préfecture en Atmo |
| `geen feed op dit adres` | HTTP 200, maar nul `<item>`/`<entry>` — meestal een HTML-pagina | URL vervangen |
| `mislukt` | netwerkfout, time-out of HTTP-fout (403, 404) | URL vervangen of bron uitzetten |

### Kapotte feed-URL opsporen

De bronnenlijst slijt: feeds verhuizen of verdwijnen, en dan staat de lade stil
zonder dat iemand het merkt. `scripts/probeer-feeds.mjs` test elke ingestelde
URL en vraagt bij een kapotte de site *zelf* waar zijn feeds staan (de
`<link rel="alternate" type="application/rss+xml">` in de HTML). Het raadt dus
geen adressen — dat verbiedt de kop van `data/nieuwsbronnen.ts` uitdrukkelijk.

**Automatisch, elke maandagochtend.** De workflow draait wekelijks vanzelf. Levert
een bron die op `actief: true` staat geen feed meer, dan eindigt de controle met
een foutcode en faalt de workflow — GitHub stuurt de eigenaar dan vanzelf een
melding. Zo hoeft niemand er zelf aan te denken; precies dát ging mis, want negen
bronnen lagen sinds eind juli stil zonder dat het opviel. Een lege maar geldige
feed (zoals Atmo) telt niet als storing, en `onbeslist` evenmin — anders slaat de
controle vals alarm en gelooft niemand hem meer.

**Zelf starten.** Tabblad **Actions** → links
**Feedcontrole** → rechts **Run workflow** → groene knop. Na ± 1 minuut staat de
uitslag in de samenvatting van de run. Het veld "filter" mag leeg blijven; vul
je er bijvoorbeeld `gironde` in, dan worden alleen bronnen met dat woord in de
naam nagelopen. De workflow heeft geen sleutels nodig en wijzigt niets.

**Vanaf een eigen machine** (vereist Node 22 en een lokale kloon):

```bash
node scripts/probeer-feeds.mjs            # alle bronnen
node scripts/probeer-feeds.mjs gironde    # alleen bronnen met "gironde" in de naam
```

Wat je met de uitslag doet:

| uitslag | wat het betekent | actie in `data/nieuwsbronnen.ts` |
| --- | --- | --- |
| `in orde` | het ingestelde adres werkt | niets; eventueel `bevestigd: true` |
| `werkt weer` | een uitgezette bron levert weer een feed | `actief: true` |
| `nieuw adres` | een geteste kandidaat levert een werkende feed | `url` vervangen, `bevestigd: true` |
| `niets gevonden` | de site is gelezen en biedt geen werkende feed | `actief: false` |
| `onbeslist` | de site liet de controle niet toe (403, time-out) | **niets** — zie hieronder |

Een gevonden adres is niet blind over te nemen: controleer of het dezelfde bron
is. Bij de controle van 26-08-2026 leverde de sectie Seine-et-Marne van Le
Parisien een 404, terwijl het beproefde `…/leparisien/rss` wél werkte — maar dat
is de landelijke feed, een andere bron, en bovendien zonder datums, waardoor de
datumpoort er structureel elk item van weigert. Die is daarom niet overgenomen.

`onbeslist` is met opzet een aparte uitkomst. Veel Franse nieuwssites weigeren
niet-browserverkeer; dan krijgt de controle een 403 op zowel de feed als de
pagina eromheen. Dat zegt niets over de bron — alleen dat er geen antwoord kwam.
Een bron op `actief: false` zetten op grond van `onbeslist` is een bron
weggooien zonder bewijs.

De controle probeert elk adres twee keer: eerst met de user-agent die
`app/api/nieuws/route.ts` zelf stuurt, daarna met een nette variant die zich
netjes bekendmaakt. Lukt het alleen met de tweede, dan meldt de uitslag
"UA-PROBLEEM" — dan ligt het niet aan het adres maar aan de user-agent van de
route, en moet díé mee veranderen.

Zet `bevestigd: true` nooit op goed vertrouwen — alleen als de feedcontrole het
adres heeft zien werken.

Een term toevoegen? Zet hem in de juiste lijst in `lib/nieuws-thema.ts` en voeg
een geval toe aan `scripts/test-nieuws-thema.ts`. Let op plaatsnamen die op
landschap lijken: `landes` (het departement Landes), `bois` (Bois-Colombes) en
kaal `champ` (Champs-Élysées) staan er bewust **niet** in — die maakten van een
autobrand op de A63 een natuurbrand.

### Verversing (`lib/nieuws-vers.ts`)

Op 26-08-2026 toonde de lade bij de eerste opening items van 1 augustus, en pas
bij de tweede opening de verse lichting. Dat was geen stilstaande vernieuwing
maar een cache. `/api/nieuws` stond op `export const revalidate = 900`, waarmee
Next er een ISR-route van maakt: in de bouwuitvoer verscheen hij als
`○ (Static) — Revalidate 15m, Expire 1y`. ISR ververst **niet** uit zichzelf elke
15 minuten; het venster zegt alleen dat een bezoeker ná 15 minuten de *oude*
versie krijgt en daarmee een achtergrondvernieuwing aftrapt. Op een tool met
weinig verkeer kan zo'n bewaarde versie dus weken blijven staan tot iemand hem
aanraakt — en `Expire 1y` zegt hoe lang dat mag duren.

De route is nu dynamisch (`export const dynamic = "force-dynamic"`, in de
bouwuitvoer `ƒ (Dynamic)`). Dat is goedkoop, want de dure delen houden hun eigen
cache: de feeds via `next.revalidate` en de samenvattingen in de durable Data
Cache. Vier grenzen, alle vier in `lib/nieuws-vers.ts`:

| grens | waarde | wat hij doet |
| --- | --- | --- |
| `FEED_REVALIDATE_S` | 15 min | hoe oud de feedgegevens mogen zijn |
| `NIEUWS_CDN_MAXAGE_S` | 5 min | CDN serveert dit ongewijzigd |
| `NIEUWS_CDN_SWR_S` | 5 min | daarna hooguit zo lang stale |
| `MAX_LEEFTIJD_MS` | 1 uur | harde bovengrens die de lade zelf bewaakt |

Normaal ziet een bezoeker dus iets van hooguit ± 25 minuten oud (10 minuten
CDN-venster plus 15 minuten feedleeftijd). Blijkt een antwoord tóch ouder dan
een uur, dan haalt de lade het eenmalig opnieuw op met een wegwerpparameter
(`?vers=…`) die elke tussenliggende cache omzeilt.

Een mislukte ophaalronde laat de vorige stand niet eindeloos staan: die stand
veroudert mee, en boven het uur meldt de lade dat de berichten ouder dan een uur
zijn en niet als de actuele stand mogen gelden. Het tijdstip van de laatste
geslaagde ophaalronde staat **altijd** onder het nieuws, ook als alles goed gaat.

Live nameten kan met:

```bash
npm run meet:cache -- https://bosbranden.vercel.app 3
```

Dat toont per ronde `x-vercel-cache`, `age`, `bijgewerkt` en de berekende
leeftijd. Springt de leeftijd tussen ronde 1 en 2 met dagen, dan is de
ISR-cache terug.

### Huisstijl

De lade is bordeaux `#800000` met wit afgedwongen (`data-thema="donker"` in
`components/Nieuwsgroepen.module.css`); het kaartblok is `#800000` op licht.
Alle kleuren staan expliciet, niets leunt op overerving.

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

Zowel de hoofdtool (`/`) als de rookmodule (`/rook`) ondersteunen `?embed=1`:
geen sitekop/-voet, compacte marges, responsive vanaf 320px breed. De rookmodule
past bij 750px breedte binnen circa 1250px hoogte (gemeten: ~1240px in
volledige staat).

### Zelfregelende iframe-hoogte (NING)

In embed-modus meet de tool haar eigen **inhoudshoogte** (de hoogte van het
wrapper-element `.omhulsel`, nadrukkelijk niet `document.body.scrollHeight`) met
een `ResizeObserver` en stuurt die **alleen bij een echte wijziging** via
`postMessage` naar de ouderpagina, onder de berichtnaam `nlfrBosbrandenHeight`.
De ouder stelt het iframe daarop bij. Omdat de gemelde hoogte de
element-hoogte is (en niet meegroeit met de iframe-hoogte die de ouder instelt),
ontstaat er geen oplopende hoogte-lus.

Voor de NING-kant staat een compleet, kant-en-klaar insluitblok in
[`ning/bosbranden.html`](ning/bosbranden.html): plak dat één keer en zet de
iframe-URL naar het live Vercel-adres met `?embed=1`. De listener erin stelt de
hoogte permanent zelf bij. De repo-kopie is de referentie; houd hem gelijk aan
wat op NING staat.

**NING 2.0** (statische hoogte; gebruik liever `ning/bosbranden.html` hierboven):

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

Zelftests (offline, geen netwerk en geen sleutels nodig):

```bash
npm test
```

Dat draait de nieuwsfilters (`test-nieuws`), de onderwerpzeef
(`test-nieuws-thema`), de versheidsgrenzen (`test-nieuws-vers`), de
zijlade-migratie en de assistent-getallen.

## Overig

- Geen analytics, cookies of advertenties; als externe frontendbron alleen
  Google Fonts (Poppins/Mulish).
- Footer linkt naar officiële preventie-informatie, Météo-France en NASA FIRMS.
- Zie je rook of vuur: bel 18 of 112 (doven/slechthorenden: 114). Volg altijd
  FR-Alert en de instructies van prefectuur en mairie.
