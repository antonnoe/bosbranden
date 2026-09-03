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

### Météo-France — Vigilance (het hele jaar)

Météo-France — [Vigilance](https://vigilance.meteofrance.fr/fr), via de API
`https://public-api.meteofrance.fr/public/DPVigilance/v1` (endpoint
`GET /cartevigilance/encours`). In de catalogus van het portaal heet die
**Vigilance Bulletin**; het basepath is `DPVigilance` en niet de volledige
catalogusnaam, net zoals bij `DPMeteoForets`.

**Waarom deze bron er is.** De Météo des forêts wordt alleen in het seizoen
gepubliceerd, dus zeven maanden per jaar staat die kaart leeg. Vigilance draait
het hele jaar en dekt negen gevaren. Brandrisico wordt daarmee één laag naast
andere in plaats van de enige reden om de tool te openen.

**Geverifieerde responsstructuur (03-09-2026):** JSON, status 200, 96
departementen (01 t/m 95 plus Corsica 2A en 2B).

```
product
  update_time, domain_id ("FRA"), global_max_color_id, version_vigilance
  periods[2]
    echeance                "J" = vandaag, "J1" = morgen
    begin_validity_time, end_validity_time, text_items{title,text}
    timelaps.domain_ids[]   domain_id, max_color_id, phenomenon_items[]
    per_phenomenon_items[]  dezelfde gegevens, per fenomeen gegroepeerd
meta
  snapshot_id, product_datetime, generation_timestamp
```

**De termijntelling is een andere dan bij de Météo des forêts.** Vigilance
gebruikt `J` voor vandaag en `J1` voor morgen; de Météo des forêts gebruikt J1
voor vandaag en J2 voor morgen. Wie die twee door elkaar haalt, schuift de hele
kaart een dag op. Een `echeance` die niet wordt herkend (een toekomstige `J2`)
wordt overgeslagen en belandt nergens, in plaats van op "vandaag" te vallen.

**Dit product beslaat alleen het Europese deel van Frankrijk.** De overzeese
gebieden hebben eigen endpoints en zitten er niet in. De route geeft die dekking
mee in het veld `dekking`, zodat een interface die dit "Frankrijk" noemt in elk
geval niet per ongeluk meer belooft dan de bron levert.

**De fenomeen-ID's komen uit de primaire bron.** Het "Descriptif technique des
informations Vigilance METROPOLE – Flux public Vigilance" van Météo-France,
sectie Carte, pagina 7. Het document draagt zelf geen versienummer en geen
datum; de enige datering zit in de bestandsnaam
`donnees-expertisees-descriptif-technique-vigilance-metropole-20230911.pdf`
(data.gouv.fr, resource `85a64f7e-8b3f-47be-80f0-b3dd9cdd01d0`, dataset
"Vigilance météorologique archivée", `last_modified` 2026-04-02).

| ID | Bron (`phenomenon_id`) | In de tool |
| --- | --- | --- |
| 1 | vent | wind |
| 2 | pluie | regen |
| 3 | orages | onweer |
| 4 | crues | hoogwater in rivieren |
| 5 | neige / verglas | sneeuw en ijzel |
| 6 | canicule | hitte |
| 7 | grand froid | strenge kou |
| 8 | avalanches | lawines |
| 9 | vagues submersion | hoge golven en overstroming vanaf zee |

Dezelfde tabel staat in het document onder Textes als `hazard_code`.

**Twee namen stonden fout voordat deze bron was gelezen**, en dat is de reden om
geen implementatie van derden als bron te gebruiken. ID 2 heette hier
"pluie-inondation" en ID 4 heette "inondation" (overstroming). Dat tweede was
inhoudelijk mis: `crues` is hoogwater in rivieren, het domein van Vigicrues, en
dat is iets anders dan overstroming in het algemeen. Het verschil met ID 9
(water dat vanaf zee komt) was daarmee verdwenen, en iemand aan een rivier zou
het verkeerde signaal hebben gekregen.

**Een ontbrekend fenomeen betekent "niet beoordeeld", nooit niveau 1.** Wie de
afwezigheid van ID 8 leest als "geen lawinegevaar", verzint een geruststelling
die Météo-France niet heeft afgegeven. De route zegt dat in het antwoord zelf,
in het veld `ontbrekendFenomeen`. Dat geldt ook wanneer het ontbreken volstrekt
normaal is: canicule (6) en grand froid (7) zitten alleen seizoensgebonden in
het carte-product. Officiële documentatiepagina van de API (Confluence
OpenDataMeteoFrance, "API Bulletin Vigilance (EN)", bijgewerkt 02-09-2025,
sectie "Common mistakes"): *"'heatwave' and 'extreme cold' phenomena absent from
the mainland France 'carte' product: these two phenomena are only measured
seasonally (see products documentation)."*

**Crues (ID 4) heeft altijd een lege `timelaps`.** Uit hetzelfde document: voor
dat fenomeen zijn de timelaps-tabellen leeg voor zowel J als J1, en komt de
kleur uit `phenomenon_max_color_id`. Wie de kleur uit een timelaps-reeks zou
halen, ziet crues dus altijd als ontbrekend, dus als niet beoordeeld, terwijl
het wél beoordeeld is.

**Tussen 00:00 en 06:00 Parijse tijd is er maar één periode.** Ook uit het
document: normaal twee blokken (J en J1), maar in die zes uur alleen J. "Morgen"
bestaat dan niet. Dat levert geen 502 op en geen afgeleide waarde; het
morgen-vak blijft leeg, en de route zegt in `ontbrekendeMorgen` waarom dat geen
"morgen is er niets aan de hand" betekent.

**Diffusie:** "nominalement tous les jours au moins à 6h et à 16h (heures
locales)", en bij een opkomende situatie vaker. De tijden ín de bestanden zijn
UTC; die publicatietijden zijn Parijse tijd.

**Twee valkuilen bij de kleurschaal.** De eerste: dit is een andere schaal dan
die van het brandrisico. Bij Vigilance betekent groen "geen bijzonderheid"; bij
de Météo des forêts betekent niveau 1 "laag risico", wat iets anders is dan geen
risico. Ze mogen nooit in dezelfde legenda staan of in elkaar worden omgerekend.

De tweede zit binnen Vigilance zélf: het kaartproduct gebruikt `color_id` 1 t/m
4 (vert, jaune, orange, rouge), maar het tekstproduct (`/textesvigilance`)
gebruikt `risk_level` "0" t/m "3" voor diezelfde vier kleuren, met daarnaast
`risk_code` "1" t/m "4". Wie ooit de teksten gaat lezen en die 0-3 als deze 1-4
behandelt, verschuift elke kleur een stap omlaag en maakt van rood oranje.

De officiële RVB-waarden uit het document zijn `#15ed13` vert, `#f9ff00` jaune,
`#f7a401` orange en `#e71919` rouge. De interface gebruikt verdiepte tinten,
dezelfde afweging als in `lib/niveaus.ts`: het officiële geel haalt geen
bruikbaar contrast met zwarte noch witte tekst. Beide staan in
`VIGILANCE_KLEUREN` (`officieleKleur` naast `kleur`), zodat de afwijking
zichtbaar is en niet stilzwijgend.

Etalab Licence Ouverte, net als de Météo des forêts. Limiet 60 requests per
minuut; de route cachet 15 minuten, wat neerkomt op vier requests per uur.
Vigilance wordt twee keer per dag vastgesteld maar kan tussentijds worden
bijgewerkt, dus de zes uur van `/api/danger` zou hier een opschaling naar oranje
missen.

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
- `app/api/vigilance` — serverless route voor Vigilance (negen gevaren, het
  hele jaar); 15 minuten cache. Zelfde key als `/api/danger`.
- `app/api/status/vervaldata` — sleutel- en abonnementsvervaldata voor een
  monitor; niet gecachet, en zonder ooit de sleutel zelf te tonen.
- `app/api/debug` — testroute voor de Météo-France-responsstructuur.
- `app/api/vigilance/debug` — idem voor Vigilance, plus welke fenomeen-ID's er
  werkelijk voorkwamen. **Staat standaard dicht** (404): vereist `VIGILANCE_DEBUG=1`
  én een omgeving die niet production is. Die route vertelt of de sleutel wordt
  geaccepteerd, en dat is diagnostiek over onze configuratie, geen publieke
  informatie.
- `lib/vigilance.ts` — fetch en portaal-administratie; de pure normalisatie
  staat aliasvrij in `lib/vigilance-normalisatie.ts` zodat ze een offline
  zelftest kan hebben (`scripts/test-vigilance.ts`).
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

### Beoordeling "waarschijnlijke natuurbrand"

`classificeerWaarnemingen()` in `lib/firms.ts` beoordeelt elke detectie al —
VIIRS-betrouwbaarheid, FRP, buren binnen 4/8 km, aantal satellietpassages — en
de brandkaart op `/` toonde dat ook. De rookkaart negeerde die beoordeling: zij
trok een pluim voor élke hittebron, waardoor de twee kaarten verschillende
dingen zeiden over dezelfde meting. Dat is nu aangesloten.

`lib/rookbeoordeling.ts` vat de beoordeling samen over de detecties van één
cluster, achter **twee poorten** die verschillend werk doen. Alles hieronder
heeft een zelftest (`scripts/test-rookbeoordeling.ts`, 15 gevallen):

- **De FRP-poort.** Valt het cluster in de kleinste band van de FRP-schaal
  (onder `FRP_KLEIN_MAX_MW` = 10 MW), dan verschijnt de markering nooit — hoe
  overtuigend de detectiesignalen ook zijn. Die grens komt uit
  `lib/frp-schaal.ts`, dezelfde band waarin de tool zo'n bron zelf "klein,
  vergelijkbaar met een brandende schuur of een klein perceel" noemt. Een
  onbekende FRP telt níet als klein: afwezige data is geen meting.
- **De detectiepoort.** Bóven die grens is één beoordeelde detectie genoeg voor
  het hele cluster. Dat is bewust asymmetrisch: `firms.ts` is al streng
  (samenhang in ruimte én tijd bóvenop een sterk signaal), en de fout die dáár
  pijn doet is de omgekeerde — een echte natuurbrand niet markeren.
- **De signalen komen alleen van de detecties die de drempel haalden.** Anders
  onderbouwt de getoonde tekst iets anders dan het oordeel erboven. De volgorde
  (aantal aflopend, dan alfabetisch) ligt vast omdat de route haar antwoord
  cachet: dezelfde invoer moet dezelfde uitvoer geven.

**Waarom de FRP-poort er is.** De eerste versie had hem niet, en een bron in de
Gers van 7,1 MW kreeg daardoor de kop "Waarschijnlijke natuurbrand" met, in
dezelfde popup, de duiderzin "klein, vergelijkbaar met een brandende schuur"
eronder. Twee onderdelen van dezelfde popup spraken elkaar tegen over precies
het onderscheid dat ze moesten maken. De schaal staat daarom nu op één plek
(`lib/frp-schaal.ts`) en wordt door beide gelezen — markering én tekst kunnen
niet meer uit elkaar lopen. `maakCluster()` geeft dezelfde afgeronde FRP door
die de popup toont, zodat ze ook niet aan weerszijden van de grens kunnen
vallen.

Op de kaart is dit **alleen een opwaardering**: een beoordeelde bron krijgt een
extra ring, een niet beoordeelde bron blijft ongewijzigd. We markeren niet
visueel dat iets "weinig voorstelt" — dat is precies de bewering die niet hard
te maken valt. Een kleine of jonge brand haalt de drempel vaak niet, en een
vaste warmtebron zoals een fabriek kan hem juist wél halen. `UITLEG.beoordeling`
zegt dat met zoveel woorden achter het info-knopje.

De beoordeling is ook de eerste sorteersleutel in `begrensPluimen()`. Dat telt
alleen wanneer de caps bijten: moeten er pluimen afvallen, dan vallen de losse
warmtebronnen af en niet de branden.

### Persbevestiging bij een brandhaard

Een satellietmeting zegt "hier is warmte". Een krant zegt "hier brandt het bos".
Dat tweede is onafhankelijke, door mensen vastgestelde informatie — categorisch
meer waard dan nóg een herberekening van dezelfde pixels. Vandaar dat een
gemarkeerde brandhaard er een regel bij kan krijgen:

> **In het nieuws** — Midi Libre meldt een brand bij Saint-Gaudens

**De koppeling werkt maar één kant op.** Een treffer waardeert een melding op;
het ontbreken van een treffer zegt *niets* en verschijnt daarom ook niet in
beeld. De tool leest zes regionale feeds (Nouvelle-Aquitaine, Occitanie,
Île-de-France, PACA). Corsica, Centre, Bourgogne, Grand Est, Bretagne en
Auvergne hebben geen enkele bron. Bovendien is de satelliet meestal eerder dan
de pers, en haalt een brand van vijf hectare de krant vaak nooit. "Geen nieuws"
betekent hier dus overwegend "wij lezen daar geen krant" — dat mag nooit als
geruststelling verschijnen.

**De trigger is de satellietmelding, niet het nieuws.** Er wordt alleen gezocht
bij haarden die de brandbeoordeling al heeft gemarkeerd. Dat houdt de bewering
klein (we bevestigen wat we zagen) en scheelt geocoder-aanroepen.

De keten, met `lib/mediakoppeling.ts` als pure, geteste kern
(`scripts/test-mediakoppeling.ts`, 22 gevallen):

1. **Feeds** — dezelfde `ACTIEVE_BRONNEN` en `filterBron()` als de nieuwslade,
   dus de onderwerpzeef van `lib/nieuws-thema.ts` heeft autobranden en
   gebouwbranden er al uit gegooid.
2. **Plaatsnaam uit de kop** — alleen ná een voorzetsel (`à`, `près de`, `au`),
   zodat een departement vooraan ("Haute-Garonne : …") niet voor een gemeente
   wordt aangezien. Kleine tussenwoorden blijven binnen de naam staan, dus
   `L'Isle-Jourdain` en `Villeneuve-lès-Avignon` overleven heel.
3. **Geocoderen** — `data.geopf.fr/geocodage/search` met `type=municipality`,
   dezelfde dienst als in `app/api/fr-alert/route.ts`. Een straat of POI kan
   dus nooit als plaats doorgaan.
4. **Ondubbelzinnigheid** — score ≥ 0,6 én minstens 0,1 boven de tweede
   kandidaat. Frankrijk telt tientallen `Saint-*`-gemeenten; zonder dat verschil
   zou de geocoder er willekeurig één kiezen.
5. **Drie harde eisen** — hetzelfde departement (dit sluit gelijknamige
   gemeenten elders uit), hooguit 20 km tussen gemeente en gemeten haard, en
   hooguit 24 uur tussen publicatie en laatste meting (aan beide kanten: een
   brand van gisteravond staat vanochtend in de krant).

Eén treffer per haard — de dichtstbijzijnde, bij gelijke afstand de nieuwste.
Een opsomming van drie artikelen over dezelfde brand voegt niets toe.

De verrijking gebeurt in `app/api/rookpluimen/route.ts`, ná `berekenPluimen()`,
achter een eigen `try`. Een storing in de feeds of de geocoder levert "geen
treffers" op — precies dezelfde uitkomst als een rustige dag, en dus nooit een
kapotte kaart.

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

**Basiskaart:** Plan IGN v2 van de
[Géoplateforme](https://geoservices.ign.fr/services-geoplateforme-diffusion) (IGN),
als WMTS-tegels:

```
https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile
  &LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM
  &FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}
```

`TILEMATRIXSET=PM` is de gewone Web-Mercator-piramide, dus Leaflets `{z}/{x}/{y}`
vertaalt rechtstreeks naar `TILEMATRIX`/`TILECOL`/`TILEROW`. Verplichte attributie
staat in de kaart: *kaart © IGN — Géoplateforme*. De dienst is vrij toegankelijk
**zonder sleutel**; `data.geopf.fr` levert ook al de geocodering in
`app/api/fr-alert/route.ts`.

Plan IGN v2 is een volwaardige topografische kaart en dus bonter dan een
canvas-ondergrond. De datalagen zijn rood en moeten domineren, dus de tegellaag
krijgt een dempende CSS-filter (`saturate(.3) brightness(1.08) contrast(.88)`) op
haar eigen container-div — via de `className`-optie van Leaflet, níet op
`.leaflet-tile-pane`, zodat een tweede tegellaag zijn eigen kleuren houdt. Onder
`prefers-contrast: more` vervalt de filter.

Géén `detectRetina`: de Géoplateforme levert geen `@2x`-tegels, dus Leaflet zou
een zoomniveau dieper gaan — viermaal zoveel verzoeken aan een publieke dienst,
en `maxZoom` één stap lager.

**Waarom niet CARTO of de OSM-tegelserver.** Hier stond CARTO *light_all*
(`basemaps.cartocdn.com`). CARTO heeft zijn gratis basemaps achter een
API-sleutel gezet: de tegels laden nog wél, maar met *API KEY REQUIRED* dwars
over elke tegel gebrand — de kaart was daarmee onbruikbaar zonder account. Een
sleutel nemen zou betekenen dat er een `NEXT_PUBLIC_`-waarde in de client-bundel
komt (onvermijdelijk bij tegels) en dat we opnieuw afhangen van een commerciële
partij die de voorwaarden eenzijdig wijzigt. De directe OSM-tegelserver
(`tile.openstreetmap.org`) valt af omdat de
[OSM-tegelgebruiksvoorwaarden](https://operations.osmfoundation.org/policies/tiles/)
zwaar productiegebruik ontmoedigen. De Géoplateforme is Franse open overheidsdata,
dekt precies het gebied van deze tool en kent dat leveranciersrisico niet.

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

## Wat er een keer verloopt

Deze tool leest overheidsbronnen met sleutels, abonnementen en certificaten die
elk hun eigen klok hebben. Verloopt er één, dan valt een module stil zonder dat
er iets aan de code mankeert, en in de logs ziet dat eruit als een 401 of een
TLS-fout. Daarom staan ze bij elkaar, en daarom zijn ze op te vragen in plaats
van met de hand bij te houden:

```
GET /api/status/vervaldata
```

Die route leest `data/vervaldata.ts` en de vervaldatum uit de sleutel zelf, en
geeft bij elke datum een `dagenTot` mee. Bedoeld voor een monitor, zodat een
aflopende sleutel opvalt vóórdat de tool stilvalt. **De sleutel zelf komt er
nooit in**, ook geen deel ervan en ook niet in een foutmelding;
`lib/sleutel-vervaldatum.ts` geeft alleen datums terug en
`scripts/test-vervaldata.ts` legt dat vast voor elk geval (geldig, geen JWT,
onleesbaar, zonder exp).

Is een datum onbekend, dan is `verlooptOp` en `dagenTot` **null** en staat er een
`opmerking` bij. Een monitor hoort op null te alarmeren en niet door te lopen:
"onbekend" is hier de stille variant van "verlopen", niet van "nog lang goed".

### Drie klokken, niet twee

| Klok | Waar | Vervalt |
| --- | --- | --- |
| Abonnement Vigilance Bulletin | `data/vervaldata.ts` | 10-07-2028 |
| Abonnement Forest weather | `data/vervaldata.ts` | 07-07-2028 |
| Abonnement Climatological data | `data/vervaldata.ts` | 10-07-2028 |
| De sleutel zelf (JWT-claim `exp`) | uit `METEOFRANCE_API_KEY` | zie endpoint |
| Dekking van de sleutel | geen datum, zie hieronder | bij elke nieuwe subscription |

De drie abonnementsdata zijn op 03-09-2026 rechtstreeks afgelezen van het
ingelogde API-portaal, onder "My API" bij `DefaultApplication`. Let op het
datumformaat: het portaal schrijft dd/mm/jjjj, dus dit is juli 2028 en niet
oktober.

**De derde klok is de gemene.** Een sleutel dekt alleen de API's waarop de
applicatie geabonneerd was **op het moment dat de sleutel werd gegenereerd**.
Dat is geen theorie: de Vigilance-koppeling gaf eerst een 403, terwijl het
abonnement al sinds 10-08-2026 onder dezelfde applicatie hing als Forest
weather. Er was niets mis met het abonnement en niets mis met de code; de
sleutel was ouder dan de subscription. **Na elke nieuwe subscription hoort er
dus een nieuwe sleutel gegenereerd en in Vercel gezet te worden**, ook als er
verder niets lijkt te zijn veranderd. Deze klok heeft geen datum en is dus niet
te monitoren; hij zit alleen in dit kopje en in `data/vervaldata.ts`.

### FR-Alert

Het leaf-certificaat van `fr-alert.gouv.fr` verliep 19-08-2026. Op 03-09-2026 op
productie gecontroleerd: de route bereikt de bron nog, dus de AIA-aanpak in
`lib/fr-alert-tls.ts` heeft die vernieuwing opgevangen. Dat is precies waarvoor
ze is gebouwd: het intermediate komt uit de AIA-URL van het leaf-certificaat en
niet uit een hardgecodeerde PEM, dus een routinevernieuwing overleeft ze
vanzelf. Wat ze niet overleeft is een overstap naar een andere certificaatketen;
dan faalt de verificatie opnieuw met `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

Monitor daarvoor op het veld **`bronBereikt`** van `/api/fr-alert`, niet op
`beschikbaar`. Die twee zeggen verschillende dingen: `beschikbaar: false` met
`bronBereikt: true` betekent "gelezen, en er speelt niets", wat een normale
rustige dag is. `bronBereikt: false` betekent dat er geen enkele FR-Alert-pagina
is gelezen, en dát is de storing. Zonder dat onderscheid ziet een rustige dag er
precies zo uit als een scrape die niets meer vindt omdat de opmaak is veranderd.
Dezelfde fout is in augustus 2026 al een keer gemaakt met de feedcontrole, die
elf werkende bronnen "geen feed aangekondigd" gaf terwijl ze nooit waren
gelezen; zie `scripts/test-feedcontrole.ts`.

## Jaarlijkse checklist

- [ ] Vóór seizoensstart: controleer de Météo-France-endpoint en `/api/debug`.
- [ ] Controleer vóór het seizoen de geldigheid van beide API-keys in Vercel.
- [ ] Vraag `/api/status/vervaldata` op. Dat geldt het hele jaar: Vigilance
      draait ook buiten het brandseizoen, dus een verlopen sleutel valt hier
      niet vanzelf in september op.
- [ ] Staat er in `/api/vigilance/debug` een fenomeen-ID dat niet in het
      descriptif technique voorkomt (`bevestigd: false`)? Dan heeft
      Météo-France er een toegevoegd en is er een nieuwe versie van dat
      document.
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
