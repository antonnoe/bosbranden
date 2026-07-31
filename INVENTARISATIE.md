# Inventarisatie — stand van de herstructurering

Peildatum: 31-07-2026. Branch: `claude/ui-restructure-inventory-tkijrj`.
Uitsluitend vaststelling aan de hand van de code; geen wijzigingen.

Belangrijk vooraf: op deze branch staan ná `c031a43` nog twee commits die in de
opdracht niet als bekend worden verondersteld:

- `55ecb7e` — **Deel B: vier correcties op c031a43** (A1–A4);
- `96640a1` — **Deel A: mobiele navigatie binnen de schil van if-mobiel** (B).

Veel van de vermoede restschuld is daarin al aangeraakt. Hieronder staat wat de
code op dit moment feitelijk toont, inclusief wat die twee commits wél en niet
hebben opgelost.

---

## 1. Samenvatting

- **A1 (groepskoppen)** is **klaar**: `.groepKop` en `.herkomst` staan nu op de
  neutrale rol (`--tekst-zacht`), niet meer op bordeaux/opacity.
- **A4 (tijdknoplabel)** is **klaar**: de knop heet "12 uur terug".
- **A3 (kaartpins)** is grotendeels **klaar** (pins en clusters op `--hittebron`),
  met één residu: de hover-/selectiekleur van een pin is nog merk-bordeaux
  (`#5f0000`).
- **A2 (wit-op-bordeaux)** is **half**: Deel B heeft de witte tekst-opacity
  opgetrokken naar een ondergrens van **0,78**, maar opacity op tekst niet
  geëlimineerd — dat botst met vaststaand uitgangspunt 2 ("nooit op tekst").
- **B (mobiele navigatie)** is, anders dan vermoed, **grotendeels aanwezig**:
  rail verdwijnt < 768 px, er is een segmented control Start/Kaart en een
  leesmateriaal-icoon voor de lade.
- **C** is grotendeels **klaar**: ernst-sortering weg, `PaneelSoort` gekrompen
  met migratie, laagkeuze met exacte labels, drie herkomstregels woordelijk.
- Grootste dan verwacht: **niet A2 zelf** maar de **verspreiding** ervan (≈ 8
  bestanden met witte tekst-opacity) en een niet-getokeniseerde vierde kleur
  **`#b00020`** die zowel als data-signaal als als tekstkleur wordt gebruikt.
- Losse eindjes: dode helpers en dode CSS in de rookmodule (oude schuif/zwevend
  paneel), en hardcoded merk-kleuren i.p.v. tokens in de kaart-CSS.
- Let op: de rol-tokens zijn ingevoerd in **Fase 1 (`67b8944`)**; `c031a43`
  raakte `globals.css` niet. `--primair-12` bestaat niet.

---

## 2. Tabel per punt

### A. Vier correcties uit `c031a43` (via Deel B, `55ecb7e`)

| Punt | Staat | Bestand:regel | Huidige waarde | Opmerking |
|---|---|---|---|---|
| A1 groepskoppen | **klaar** | `components/Start.module.css:64` | `.groepKop { color: var(--tekst-zacht) }` | Was `var(--primair-55)`; in Deel B naar neutraal. |
| A1 (idem) | **klaar** | `components/Start.module.css:121` | `.herkomst { color: var(--tekst-zacht) }` | Was `rgba(51,39,39,0.6)` (opacity op tekst) → nu solide token. |
| A2 wit-op-bordeaux | **half** | zie lijst hieronder | `color: rgba(255,255,255,0.78..0.9)` | Deel B tilde de ondergrens naar 0,78; opacity op tekst blijft bestaan → strijdig met uitgangspunt 2. |
| A3 pins rol-kleur | **klaar** | `components/Waarnemingen.module.css:199` | `.mapPin path { fill: var(--hittebron) }` (`#e8202a`) | Was `#800000`; in Deel B omgezet. |
| A3 clusters | **klaar** | `components/KaartClusters.module.css` (`.clusterCore` fill, `.clusterHalo` focus-stroke) | `fill: var(--hittebron)` / `stroke: var(--hittebron)` | Idem omgezet van `#800000`. |
| A3 residu hover/select | **half** | `components/Waarnemingen.module.css:214` | `.mapPin:hover path, .mapPinSelected path { fill: #5f0000 }` | Hover/selectie van een hittebron-pin wordt nog merk-bordeaux, niet een hittebron-tint. |
| A4 tijdknop | **klaar** | `components/Rookmodule.tsx:647` | `"12 uur terug"` | Was "Afgelopen 12 uur". |

Resterende opacity-op-tekst (A2), witte tekst met `color: rgba(255,255,255,<1)`:

| Bestand:regel | Klasse | Waarde |
|---|---|---|
| `components/Zijkolom.module.css:8` | `.leeg` | `0.9` |
| `components/Zijkolom.module.css:186` | `.verantwoordingGrens` | `0.88` |
| `components/Zijkolom.module.css:193` | `.verantwoordingSlot` | `0.78` |
| `components/Zijkolom.module.css:83,126,144` | `::before`-markers (–, ·, →) | `0.78` |
| `components/Zijlade.module.css:330` | `.uitlegTab` (inactieve tab) | `0.78` |
| `components/Duiding.module.css:13,60,129` | `.leeg`, `::placeholder`, noot | `0.9` / `0.78` |
| `components/Infographics.module.css:12` | `.leeg` | `0.9` |
| `components/Nieuwsgroepen.module.css:20,144,156,278,294` | diverse tekst (donker thema) | `0.78`–`0.92` |
| `components/Rookmodule.module.css:697` | `.keuzeActief .knopOnder` (wit op bordeaux) | `0.8` |
| `components/Bronnen.tsx:100` | inline bronregel | `0.78` |

### B. Mobiele navigatie (via Deel A, `96640a1`)

| Punt | Staat | Bestand:regel | Huidige waarde | Opmerking |
|---|---|---|---|---|
| Rail < 768 px | **klaar** (verborgen) | `components/Zijlade.module.css:508,521-523` | `@media (max-width:768px){ .rail{ display:none } }` | Enige breakpoint is 768 px. |
| Segmented control Start/Kaart | **aanwezig** | `components/Zijlade.tsx:185-189`; CSS `:355,:367-403,:508-519` | knoppen `Start` (`/start`), `Kaart` (`/`) | `.mobielKop` default `display:none`, < 768 px `display:flex`. Rookpaden zit hier bewust **niet** in (uitgangspunt 3). `/rook` blijft als URL bereikbaar. |
| "Terug naar de pagina" | **aanwezig, verborgen op mobiel** | `Start.tsx:194`, `Tool.tsx:236`, `Rookmodule.tsx:533` | render bij `!embed`; `globals.css:139-142` `.terug-pagina-knop{ display:none }` < 768 px | Dus zowel embed-check als 768 px-breakpoint verbergen hem. |
| `?embed=`-logica | alleen iframe-embed | `app/page.tsx:13`, `app/start/page.tsx:16`, `app/rook/page.tsx:16` | `params.embed === "1"` | **Geen** aparte if-mobiel-detectie. Het if-mobiel-geval wordt gedekt door de < 768 px-media queries plus `--if-onderbalk` (host-set, default 56 px) die onderbalkruimte reserveert (`Zijlade.module.css:528,541`, `globals.css:148`). |
| Nieuws/Uitleg op klein scherm | **bruikbaar** | `Zijlade.tsx:190-215` (`.leesIcoon`), `:273-293` (`.mobielLadeSchakel`) | lees-icoon opent lade op `"uitleg"`; in de lade schakelt men Nieuws/Verantwoording | Lade schuift schermvullend (`min(440px, 100%-48px)`) boven de onderbalk. |

### C. Feitelijke wijzigingen sinds de handoff

| Punt | Staat | Bestand:regel | Huidige waarde | Opmerking |
|---|---|---|---|---|
| `lijst.sort` op ernst verwijderd | **ja** | `components/Start.tsx` (geen `.sort(`) | comment `:5-6` "wordt nooit gesorteerd op ernst" | Vaste volgorde via `MODULES` + `Groep`. |
| `PaneelSoort` → `"nieuws"\|"uitleg"` | **ja** | `lib/zijlade-migratie.ts:9` | `export type PaneelSoort = "nieuws" \| "uitleg"` | — |
| sessionStorage-migratie | **ja** | `lib/zijlade-migratie.ts:17-31,37-39` | `migreerPaneelSleutel` mapt `duiding`/`verantwoording`/`infographics` → `uitleg`; `beginUitlegTab` herstelt de interne tab | Aangeroepen in `Zijlade.tsx:53-64`. |
| Laagkeuze boven de kaart | **ja** | `components/Tool.tsx:435-446`; `lib/kaartlaag.ts:13-17` | labels `Gevaar morgen` · `Hittebronnen 24 u` · `Officiële meldingen` | Exact zoals gevraagd; stuurt `?laag=`. |
| Drie herkomstregels woordelijk | **ja** | `lib/modules.ts:33,40,47` | `Satelliet VIIRS · per pixel · afgelopen 24 uur` / `Météo-France · per departement · morgen & overmorgen` / `Autoriteiten · hele land · met vertraging` | Getoond via `Herkomst` (`Start.tsx:417-421`). |
| Tokens in `globals.css` | zie hieronder | `app/globals.css:4-42` | volledige rol-set | Ingevoerd in **Fase 1 (`67b8944`)**, niet in `c031a43`. `--primair-12` bestaat **niet**. |

Huidige tokens (`app/globals.css:4-42`), met waarde:

- Merk: `--merk #800000`, `--merk-vlak #f4ecea`, `--merk-diep #5c0000`.
- Merk-alias/alpha (randen/vlakken): `--primair #800000`, `--primair-04`,
  `--primair-08`, `--primair-15`, `--primair-30`, `--primair-55`, `--primair-80`
  (allen `rgba(128,0,0, …)`).
- Neutraal: `--tekst #2b2220`, `--tekst-zacht #6e5f5b`, `--rand #e8dedb`,
  `--vlak #f2f0ee`, `--pagina #faf7f6`, `--kaart #ffffff`,
  `--achtergrond #faf7f6`, `--geen-data #d9d9d9`.
- Gevaarniveau: `--niveau-1 #2f6b3a`, `--niveau-2 #d4a017`, `--niveau-3 #c2560f`,
  `--niveau-4 #e8202a`.
- Kaartdata: `--rook-gemeten #3f3733`, `--rook-verwacht #c2560f`,
  `--hittebron #e8202a`.
- Runtime (niet gedefinieerd, host-set): `--if-onderbalk` (default 56 px).

---

## 3. Bestandenkaart

| Onderwerp | Bestanden |
|---|---|
| **Kleur / tokens** | `app/globals.css` (tokendefinities); `lib/niveaus.ts` (gevaarniveau-kleuren + `tekstKleur`); `components/Start.module.css`, `components/Waarnemingen.module.css`, `components/BrandLagen.module.css`, `components/KaartClusters.module.css`, `components/Rookmodule.module.css`, `components/Zijlade.module.css`, `components/Zijkolom.module.css`, `components/Duiding.module.css`, `components/Infographics.module.css`, `components/Nieuwsgroepen.module.css`, `components/CamsVerwijzing.module.css` |
| **Navigatie / rail / lade** | `components/Zijlade.tsx` + `components/Zijlade.module.css` (rail, mobiele kop, segmented control, lade); `lib/zijlade-migratie.ts` (PaneelSoort + migratie); `app/layout.tsx` (één schil op alle routes); `lib/modules.ts` + `components/Start.tsx` (start-blokken, herkomst) |
| **Kaartlaag (SVG-kaart `/`)** | `components/Tool.tsx` (laagkeuze, legenda), `lib/kaartlaag.ts` (labels/uitleg), `components/FranceKaart.tsx` (pins, clusters, FR-Alert-markers, popups) |
| **Rook (`/rook`)** | `components/Rookmodule.tsx` + `components/Rookmodule.module.css`; `components/kaart/LeafletKaart.tsx` + `.module.css` (schil); `lib/rookdrift.ts` (server) |
| **Embed / if-mobiel** | `app/page.tsx`, `app/start/page.tsx`, `app/rook/page.tsx` (`?embed=1`); `components/EmbedHoogte.tsx` (hoogtemelding); `app/globals.css` + `components/Zijlade.module.css` (< 768 px + `--if-onderbalk`) |

---

## 4. Risico's (waar een correctie iets anders kan breken)

1. **A2 volledig oplossen** (opacity van tekst halen) raakt ≈ 8 bestanden. De
   opacity draagt nu ook het onderscheid actief/inactief (bijv. `.uitlegTab`
   0,78 vs. 1,0 actief). Vervang door **solide** licht-tinten, anders verdwijnt
   dat contrast. Let op de `::before`-markers (–, ·, →): die zijn technisch
   tekst.
2. **A3-residu** (`.mapPin` hover/selected `#5f0000`) wijzigen vergt een
   donkerder **hittebron-tint**, niet het merk; hover/selectie moet zichtbaar
   verschillen van de rustende `#e8202a`.
3. **Hardcoded merk-kleuren tokeniseren** in de kaart-CSS (`Waarnemingen`,
   `BrandLagen`): in embed staan de tokens op de host-wrapper
   (`.if-dossier-wrapper`), standalone op `:root`. Controleer dat de kaart-CSS
   binnen dat wortelbereik valt vóór je `rgba(128,0,0,…)` door `var(--primair-…)`
   vervangt, anders breekt de embed-kleur.
4. **`#b00020` rationaliseren**: het is tegelijk data-signaal (FR-Alert
   officieel) én tekst-accent (`.kerncijfer`, `.zwaarsteRegel`). Die twee
   betekenissen eerst ontwarren; anders maakt één token de rolvermenging vast.
5. **Dode rook-CSS/helpers verwijderen** is veilig (grep: 0 verwijzingen), maar
   controleer op dynamisch samengestelde of `:global` klassenamen vóór het
   opschonen.

---

## 5. Vragen (besluit nodig)

1. **Uitgangspunt 2 vs. Deel B.** De correctie koos een opacity-**ondergrens**
   van 0,78 op witte tekst; het uitgangspunt zegt "nooit opacity op tekst". Wat
   geldt: ondergrens 0,78 handhaven, of alle tekst-opacity vervangen door
   solide wit/lichtgrijs?
2. **`#b00020`.** Is dit een bewuste **vierde kleurrol** (FR-Alert officieel =
   crimson, apart van hittebron-rood en merk-bordeaux)? Zo ja: token maken en
   documenteren. En mag `#b00020` als **tekstkleur** blijven (`.kerncijfer`,
   `.zwaarsteRegel`), of botst rood-op-tekst met "rood = gevaarniveau"?
3. **`.mapPin` hover/selected `#5f0000`.** Bewust merk-donker als
   "geselecteerd"-affordance, of naar een hittebron-rode tint?
4. **if-mobiel.** Wordt de app in if-mobiel ingesloten **mét** `?embed=1`? Er is
   geen aparte if-mobiel-detectie; de mobiele nav hangt puur aan viewport
   < 768 px. Klopt die aanname, en wie zet `--if-onderbalk`?
5. **Dode rook-slider/paneel-CSS + helpers** (`SCHUIF_MIN`/`SCHUIF_MAX`,
   `tijdLabel`, `horizonTekst`, `satellietDatum`; CSS `.datumBalk`,
   `.laagPaneel`, `.onderBalk`, `.tijdBalk`, `.schuifWrap`, `.nuMerk`,
   `.horizon` e.a.): weg in de volgende ronde, of bewust bewaard voor een
   terugkeer van de schuif?

---

## Bijlage — afwijkingen en verrassingen (D)

- **Dode helpers in `components/Rookmodule.tsx`**: `SCHUIF_MIN`/`SCHUIF_MAX`
  (`:26-27`), `tijdLabel` (`:1030`), `horizonTekst` (`:1036`), `satellietDatum`
  (`:1148`) — nergens aangeroepen. Restanten van de vervangen tijdschuif.
- **Dode CSS in `components/Rookmodule.module.css`** (oud zwevend paneel +
  schuif): `.datumBalk`, `.laagPaneel`, `.onderBalk`, `.lagenKop`,
  `.laagInhoud`, `.modusRij`, `.laagKnop`, `.laagFout`, `.dekking`, `.tijdBalk`,
  `.tijdLabel`, `.schuifWrap`, `.nuMerk`, `.horizon`, `.horizonPunt`, `.legenda`
  (0 verwijzingen in `Rookmodule.tsx`). De actuele bediening gebruikt
  `.bediening/.laagKeuze/.tijdKeuze/.keuzeKnop/.legendaDetails`.
- **`.nav`** in `components/Zijlade.module.css:159-163` lijkt ongebruikt (de rail
  gebruikt `.railGroep`).
- **`#b00020`** — niet-getokeniseerde crimson, dubbel gebruikt:
  data-signaal (`BrandLagen.module.css:59,113,130` FR-Alert-markers;
  `Tool.tsx:529` legenda-swatch) én **tekst** (`Start.module.css:40`
  `.zwaarsteRegel`, `:131` `.kerncijfer`; `Rookmodule.module.css:211` `.laagFout`
  (dood)). Geen token in `globals.css`.
- **`ERNST_ACCENT`** in `components/Start.tsx:29-35` mengt merk-alpha
  (`rgba(128,0,0,0.25/0.5)` voor ernst 1-2) met rode signalen (`#b00020`,
  `#e8202a` voor 3-4) voor de border-left van het hittebronnen-blok. Rand →
  opacity toegestaan, maar de kleur-rol is dubbelzinnig (merk vs. gevaar).
- **Dubbele bron van waarheid voor kleur**: de kaart-CSS
  (`Waarnemingen.module.css`, `BrandLagen.module.css`) hardcodeert overal
  `rgba(128,0,0,…)`/`#800000` i.p.v. de `--primair-*`-tokens.
  `Zijlade`/`Zijkolom` hardcoden **bewust** (host-schil zet tokens in embed; zie
  `Zijlade.module.css:1-7`).
- **`!important`**: `CamsVerwijzing.module.css:80,89,94,99` (kleur-overrides,
  vermoedelijk tegen host/Divi-CSS); `Rookmodule.module.css:266,267,273,274,279,280`
  (vormcorrectie legenda-swatches); `Nieuwsgroepen.module.css:348` (marge).
- **Inline styles die tokens (deels) omzeilen**: `components/Tool.tsx:415-457`
  bouwt de laagkeuze met inline styles (gebruikt wél `var(--tekst-zacht)`);
  legenda-swatches `:529` gebruiken hardcoded `#b00020`. `Start.tsx` bevat veel
  cosmetische inline styles (marges, off-screen labels).
