# UX-besluiten en voortgang

Dit bestand legt vast waaróm de UX-verbeterronde loopt, wélke besluiten zijn
genomen, en hoe ver de uitvoering staat. Het is de actuele stand: elke PR in de
ronde werkt de statustabel hieronder bij.

## Waarom deze ronde

Uit een UI/UX-assessment van `main` kwamen zeventien bevindingen, verdeeld over
drie prioriteiten:

- **P1 — gebruikers lopen vast**: dingen die iemand klemzetten (geen weg terug,
  een lade die zichzelf opent, focus die in een onzichtbaar paneel verdwijnt).
- **P2 — gebruikers begrijpen het niet**: de tool werkt, maar de bedoeling of de
  uitkomst komt niet over.
- **P3 — hygiëne**: dubbele componenten, losse stijlen, taal en kleur die niet
  één lijn trekken.

De volledige analyse ligt bij de opdrachtgever; dit bestand vat alleen de
besluiten en de voortgang samen.

## Genomen besluiten

Deze besluiten staan vast en worden in de PR's uitgevoerd:

- **Navigatie heeft drie doelen — Start · Kaart · Rookpaden — op elk formaat.**
  `/rook` is een eigen route; na het schrappen van de interne terug-links is er
  anders geen weg terug.
- **Satellietbeeld in de rookmodule is verwijderd (optie B).** Het was een
  onbereikbare functie; de code blijft in de geschiedenis staan. De route
  `/api/satellietbeeld` blijft wel bestaan.
- **Postcode is en blijft optioneel.** Zonder postcode is heel Frankrijk de
  normale, volledige weergave — geen halve of lege toestand.
- **"Heel Frankrijk" staat permanent op dezelfde plek** op beide kaarten, zodat
  de weg terug naar het overzicht altijd op één vaste plek zit.
- **Radius van het persoonlijke kerncijfer: 75 km vanaf het
  departementmiddelpunt.** In de tekst omschreven als "in en rond uw
  departement".
- **Voorbehouden mogen één klik dieper**, met twee uitzonderingen die zichtbaar
  blijven bij het cijfer waar ze bij horen: de noodregel (18/112/114, FR-Alert,
  prefectuur/mairie) en "een detectie is een waarneming van warmte, geen
  bevestigde brand".

## Status per bevinding

Status: **klaar** / **in behandeling** / **open**. De kolom PR verwijst naar de
PR waarin het werk zit.

### P1 — gebruikers lopen vast

| # | Bevinding | Status | PR |
|---|---|---|---|
| 1.1 | Eén navigatiemodel met drie bestemmingen op elk formaat | klaar | PR 2 |
| 1.2 | Alle terugwegen in de pagina eruit, één uitgaande verwijzing in de voet | klaar | PR 1 |
| 1.3 | De lade opent nooit zichzelf | klaar | PR 1 |
| 1.4 | Het gesloten paneel is niet meer tab-bereikbaar (`inert`) | klaar | PR 2 |

### P2 — gebruikers begrijpen het niet

| # | Bevinding | Status | PR |
|---|---|---|---|
| 2.1 | Eén postcodecomponent voor de pagina's; antwoord reist mee | klaar | PR 4 |
| 2.2 | `/rook` en `/` renderen direct; data schuift in | klaar | PR 4 |
| 2.3 | Kerncijfer "wat geldt bij mij" (75 km vanaf departementmiddelpunt) | klaar | PR 4 |

### P3 — hygiëne

| # | Bevinding | Status | PR |
|---|---|---|---|
| 3.1 | Satellietbeeld eruit (optie B) | klaar | PR 3 |
| 3.2 | De twee kaarten gelijktrekken (zoomknoppen, sluiten, legenda, uitlegregel) | klaar | PR 6 |
| 3.3 | Eén schakelaar per bedoeling | klaar | PR 5 |
| 3.4 | Voorbehoud achter het antwoord (behalve noodregel en warmte-detectie) | klaar | PR 5 |
| 3.5 | Tijdknoppen dekken het 24-uursvenster | klaar | PR 5 |
| 3.6 | Lekentaal in de detaillabels; getal niet laten afbreken | klaar | PR 5 |
| 3.7 | Kleurrol herstellen (ernst-ramp naar `--niveau-1..4`, `#b00020` weg) | klaar | eerdere ronde (PR #7) |
| 3.8 | Eén typografische schaal (vier stappen, ondergrens 0,85rem) | klaar | PR 6 |
| 3.9 | Eén keuzebalk-component (inline stijlen naar een klasse) | klaar | PR 5 |

Alle zestien bevindingen zijn afgerond. De omvangrijkste twee (3.2 kaartpariteit
en 3.8 typografische schaal) stonden in een eigen PR 6 met visuele controle.

Twee bewuste uitzonderingen op de ondergrens van 0,85rem (P3.8): de compacte
onderschriften op de tijd-/laagknoppen in de rookmodule (0,76rem) en het
telbadge op de nieuws-lade (0,68rem) — dat is knop- respectievelijk
teller-chrome, geen leestekst. Uppercase-labels staan op de labelmaat 0,78rem;
de niveaubloklabels blijven op 0,85rem (niet kleiner dan voorheen).

De bevinding over het gesloten paneel is in het assessment zowel onder P1 (1.4)
als onder P3 (P3.4) genoteerd; het is één stuk werk en staat hier één keer, als
1.4. Daarmee komen de zeventien assessment-regels neer op zestien unieke
bevindingsnummers.

## /start — "het zwaarste" ontdubbeld

Op `/start` werd "het zwaarste" op één scherm voor twee verschillende dingen
gebruikt en las het als tegenspraak: de kopregel onder de h1 zei "Op dit moment
het zwaarste: niveau 3 in Aude" (brandgevaar, Météo-France, verwáchting), terwijl
het hittebronnenblok "Zwaarst: Var" zei (satellietmetingen, áfgelopen 24 uur).
Elke regel noemt nu zijn eigen onderwerp én bron:

- kopregel: "Hoogste brandgevaar nu: niveau 3 in Aude (Météo-France)";
- hittebronnenblok: "Meeste warmte gemeten in: Var".

Nergens nog kaal "het zwaarste". De rest van het scherm is nagelopen op dezelfde
dubbelzinnigheid: het FR-Alert-blok en `/rook` gebruiken de term niet, dus daar
was niets recht te trekken. (De interne hittebronnen-samenvatting in
`/api/status` bevat nog "zwaarst getroffen", maar die tekst wordt nergens
getoond.)

In hetzelfde blok stonden de dataregel en het voorbehoud als één doorlopende
zin ("Zwaarst: Var. Een detectie is een waarneming van warmte, geen bevestigde
brand."). Die zijn nu twee elementen: "Meeste warmte gemeten in: Var" staat in
de niveaukleur van het gemelde niveau (gelijk aan het linker-randaccent van het
blok); het voorbehoud staat eronder als eigen regel in `--tekst-zacht`, kleiner
(0,85rem, de typografische ondergrens uit P3.8). Het voorbehoud blijft direct
zichtbaar (vast besluit, zie "Genomen besluiten"), maar wordt niet meer als deel
van de meting gelezen. Gecontroleerd op 375/768/1440 en `?embed=1`.

### Correctie: kopregel zei "nu", maar Météo-France geeft een verwachting

De kopregel zei "Hoogste brandgevaar **nu**: niveau 3 in Aude", terwijl het
Brandgevaar-blok eronder onder "STRAKS — VERWACHT" staat en hoog (3) voor
**morgen** meldt. "nu" verwarde meting met verwachting. De kopregel neemt de
dagaanduiding nu uit hetzelfde veld als de blokjes: "Hoogste brandgevaar
**morgen**: niveau 3 in Aude (Météo-France)", en "overmorgen" wanneer het hoogste
niveau op dag 2 (`j2`) valt. Bij een gelijk hoogste niveau op beide dagen wint de
dichtstbijzijnde dag (morgen). Bij ontbrekende data (buiten het seizoen) is de
bron leeg en beweert de kopregel niets — hij verschijnt dan niet.

## Navigatie — de twee lade-knoppen onderscheidbaar op mobiel

Onder 768px tonen de twee lade-knoppen rechts in de navigatie alleen een icoon
(het tekstlabel is verborgen; boven 768px staat het label er wél). De twee iconen
— een krant (Nieuws) en een document-met-lijnen (Uitleg & bronnen) — leken op dat
formaat te veel op elkaar. Het Uitleg-icoon is nu een info-cirkel (ⓘ), een heel
ander silhouet dan de krant, en de Nieuws-knop houdt zijn telbadge (het aantal
recente berichten, hoekbadge onder 768px, inline pil erboven). De `aria-label`
blijft in beide gevallen de volledige naam ("Nieuws" / "Uitleg & bronnen"), zodat
schermlezers niets missen. Tekstlabels voor beide knoppen pasten niet op 375px
naast de driedelige segmented control (Start · Kaart · Rookpaden), vandaar de
icoon-met-badge-oplossing. Gecontroleerd op 375/768/1440 en `?embed=1`.

## De "Leg uit"-bug en de vier fixes

Vóór deze ronde bleek de AI-uitlegknop ("Leg uit") datums, betrouwbaarheids-
uitspraken en vergelijkingen te verzinnen die niet in de meetgegevens stonden.
Dat is met vier fixes verholpen, elk als eigen commit (samengevoegd in PR #8):

- **Tijdstip altijd in de context** — het waarnemingsmoment wordt nu altijd
  meegegeven, met "niet meegegeven" als het ontbreekt (`775f1e1`).
- **Grootteorde uit een codetabel** — de FRP-duiding komt uit een vaste tabel in
  plaats van uit een verzonnen vergelijking; de zelf-vergelijking is server-side
  weggehaald (`0f392c8`).
- **Ontbrekende velden expliciet benoemen** — een leeg veld wordt als "niet
  meegegeven" geschreven in plaats van ingevuld (`5066c7b`).
- **Cijfercontrole met deterministische terugval** — het antwoord wordt op
  onbekende getallen en datums gecontroleerd; bij twijfel valt het terug op een
  vaste, deterministische uitlegtekst. Een aanvullende fix controleert de datum
  als geheel en let op de eenheid (`8d2f7bd`, `d0fd755`).
