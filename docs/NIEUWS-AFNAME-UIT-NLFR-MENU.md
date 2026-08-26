# Oordeel: kan de eigen nieuwspijplijn worden vervangen door afname uit nlfr-menu?

Opdracht 3 van 26-08-2026. **Dit is een oordeel, geen bouwstuk.** Er is niets
aan gebouwd en er is geen voorbereidende code voor geschreven.

## Advies in één zin

**Nee — niet vervangen, maar wél de zeef delen.** Neem de nieuwspijplijn van
`antonnoe/nlfr-menu` niet af als nieuwsbron voor deze tool; verhuis in plaats
daarvan de *zeeflogica* naar één gedeeld pakket dat beide tools importeren.
Dan hoeft de verbetering die telt nog maar op één plek te gebeuren, zonder dat
deze tool afhankelijk wordt van een dienst met een andere opdracht.

## Waarom niet afnemen

**1. De scopes lopen uit elkaar, en die van nlfr-menu is de bredere.**
nlfr-menu bedient Nederlanders in Frankrijk in de volle breedte: belasting,
wonen, staking, zorg, verkeer, verenigingen. Deze tool gaat over één ding.
Afnemen betekent dat wij hun stroom alsnog moeten filteren op ons onderwerp —
dus de zeef die nu in `lib/nieuws-thema.ts` staat, blijft hoe dan ook nodig.
De winst van afname is daarmee veel kleiner dan hij lijkt: we ruilen het
ophalen van feeds in, niet het filteren.

**2. Precies op het beslissende punt staat hun zeef verkeerd voor ons.**
In nlfr-menu is `incendie` een insluitterm die *altijd wint*
(`FAITS_DIVERS_IN` in `lib/config.js`). Voor hen klopt dat: een brand is voor
hun lezer relevant nieuws. Voor ons is het de bron van de vervuiling — het is
letterlijk waarom er uitgebrande auto's in de lade stonden. Hun
buitenlandredding is bovendien ruimer (Frankrijk, Nederland én de EU), terwijl
wij alleen Frankrijk mogen redden. Wij zouden hun uitkomst dus systematisch
moeten terugsnoeien, en dat is fragieler dan zelf zeven: je kunt niet
terughalen wat zij al hebben weggegooid, maar je moet wel weggooien wat zij
hebben doorgelaten.

**3. Hun bronnenlijst is de onze niet.**
`bronnen.json` in nlfr-menu bevat landelijke Franse en Nederlandse pers plus
overheidsfeeds. Onze `data/nieuwsbronnen.ts` bevat juist de regionale bronnen
van de brandregio's: Sud Ouest, Midi Libre, ici.fr Gironde/Gascogne/Pays
basque, France 3 Nouvelle-Aquitaine, préfecture de la Gironde, Atmo
Nouvelle-Aquitaine, Corse-Matin. Een préfecture-communiqué over de gesloten
jacht in de Gironde is voor ons kernmateriaal en voor hen ruis; het staat dan
ook niet in hun bronnenlijst. Afnemen kost ons die bronnen, tenzij zij ze
opnemen — en dan vervuilen wij hún tool.

**4. Een tweede tool ertussen is een tweede storingspunt, en dit is een
veiligheidstool.** De kaart, FIRMS en de rookmodule blijven werken als het
nieuws uitvalt, dus de schade blijft beperkt — maar een tool die mensen bij
brandgevaar raadplegen, wil geen extra schakel die stil kan vallen zonder dat
wij er iets aan kunnen doen. Nu falen alleen de feeds zelf, en dat toont de
lade per bron.

**5. Hun pijplijn heeft een menselijke poort, de onze niet.**
In nlfr-menu gaat persmateriaal via clustering en AI-synthese naar een
*concept*, dat pas live gaat als iemand het in de reviewtool publiceert
(`/review?token=…`). Dat is daar een bewuste keuze. Voor ons is het een
blokkade: de randvoorwaarde is dat de lade volledig automatisch bijwerkt,
zonder handmatige stap. Afnemen van hun gepubliceerde stroom zou betekenen dat
onze lade stilstaat zolang niemand daar op "publiceer" klikt.

## Wat wél te delen valt, en dat is het meeste waard

De inhoudelijke kennis in beide tools zit niet in het ophalen van feeds — dat
is dertig regels — maar in de **woordenlijsten en de matchregels**. Die zijn in
beide repo's inmiddels apart uitgewerkt en lopen uiteen, en dáár doet dubbel
onderhoud pijn: de hoofdstad Islamabad ontbrak in de landenlijst van nlfr-menu
en is hier toegevoegd; de apostrof-normalisatie (`qualité de l'air` →
`qualite de l air`) was in beide een stille bug.

Een gedeeld pakket met `normaliseer`, `bevatWoord`, `bevatWoordDeel`, de
landen-/inwoners-/hoofdstedenlijst en de faits-divers-lijsten mét Nederlandse
spiegel — met per tool een eigen, dunne configuratielaag erbovenop voor wat
kern is en wat steun — geeft de gevraagde "verbeteringen nog maar op één plek"
zonder de vijf bezwaren hierboven. Dat is een aparte opdracht en is hier
uitdrukkelijk niet gebouwd.

## Wat dit oordeel niet dekt

- Ik heb niet kunnen meten hoeveel overlap er feitelijk is tussen wat
  `/api/actueel` van nlfr-menu oplevert en wat onze lade toont: de
  netwerktoegang van de werkomgeving is geblokkeerd, dus geen van beide
  eindpunten was op te vragen. Het oordeel steunt op de code van beide repo's,
  niet op een vergelijking van hun live uitvoer.
- Of de préfecture- en Atmo-feeds werkelijk leveren, is hier evenmin
  vastgesteld; beide staan in `data/nieuwsbronnen.ts` als
  `bevestigd: false`.
