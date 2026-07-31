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
| 2.1 | Eén postcodecomponent voor de pagina's; antwoord reist mee | open | PR 4 |
| 2.2 | `/rook` en `/` renderen direct; data schuift in | open | PR 4 |
| 2.3 | Kerncijfer "wat geldt bij mij" (75 km vanaf departementmiddelpunt) | open | PR 4 |

### P3 — hygiëne

| # | Bevinding | Status | PR |
|---|---|---|---|
| 3.1 | Satellietbeeld eruit (optie B) | in behandeling | PR 3 |
| 3.2 | De twee kaarten gelijktrekken (zoomknoppen, sluiten, legenda, uitlegregel) | open | PR 5 |
| 3.3 | Eén schakelaar per bedoeling | open | PR 5 |
| 3.4 | Voorbehoud achter het antwoord (behalve noodregel en warmte-detectie) | open | PR 5 |
| 3.5 | Tijdknoppen dekken het 24-uursvenster | open | PR 5 |
| 3.6 | Lekentaal in de detaillabels; getal niet laten afbreken | open | PR 5 |
| 3.7 | Kleurrol herstellen (ernst-ramp naar `--niveau-1..4`, `#b00020` weg) | klaar | eerdere ronde (PR #7) |
| 3.8 | Eén typografische schaal (vier stappen, ondergrens 0,85rem) | open | PR 5 |
| 3.9 | Eén keuzebalk-component (inline stijlen naar een klasse) | open | PR 5 |

De bevinding over het gesloten paneel is in het assessment zowel onder P1 (1.4)
als onder P3 (P3.4) genoteerd; het is één stuk werk en staat hier één keer, als
1.4. Daarmee komen de zeventien assessment-regels neer op zestien unieke
bevindingsnummers.

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
