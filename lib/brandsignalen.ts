// De signaalteksten van de brandbeoordeling, en welke ervan twee standen van
// dezelfde meter zijn.
//
// WAAROM DIT EEN APART BESTAND IS. classificeerWaarnemingen() in lib/firms.ts
// kiest per detectie één stand per as: bij FRP ≥ 10 MW "sterk uitgestraald
// warmtevermogen", anders bij ≥ 3 MW "verhoogd uitgestraald warmtevermogen".
// Per detectie sluiten die elkaar dus uit. Maar de rookkaart vat de signalen
// samen over álle detecties van een cluster, en dan belandden beide standen in
// dezelfde opsomming: "… sterk uitgestraald warmtevermogen, verhoogd
// uitgestraald warmtevermogen". Dat leest als een lijst die zichzelf tegenspreekt.
//
// Door de teksten én hun onderlinge verhouding hier vast te leggen, kan de
// samenvatting niet uit de pas lopen met wat de classificatie bedoelde. Zelfde
// reden als bij lib/frp-schaal.ts.
//
// Bewust vrij van imports en van het "@/"-alias, zodat lib/rookbeoordeling.ts
// het buiten Next kan laden (zie scripts/test-rookbeoordeling.ts).

export const SIGNAAL = {
  betrouwbaarheidHoog: "hoge VIIRS-betrouwbaarheid",
  frpSterk: "sterk uitgestraald warmtevermogen",
  frpVerhoogd: "verhoogd uitgestraald warmtevermogen",
  nabijheidVeel: "meerdere nabijgelegen metingen binnen tien uur",
  nabijheidEnkel: "nabijgelegen aanvullende meting",
  ruimtelijkCluster: "ruimtelijk cluster van hittemetingen",
  meerderePassages: "waargenomen tijdens meerdere satellietpassages",
} as const;

// Zwakkere stand → sterkere stand op dezelfde as. Staan beide in een
// samenvatting, dan zegt de sterkere alles wat de zwakkere zegt en meer.
const ZWAKKER_DAN: ReadonlyArray<readonly [zwak: string, sterk: string]> = [
  [SIGNAAL.frpVerhoogd, SIGNAAL.frpSterk],
  [SIGNAAL.nabijheidEnkel, SIGNAAL.nabijheidVeel],
];

// Laat van elke as alleen de sterkste aanwezige stand staan. De volgorde van de
// overgebleven signalen blijft ongemoeid — die is elders al betekenisvol
// gesorteerd.
export function ontdubbelSignalen(signalen: string[]): string[] {
  const aanwezig = new Set(signalen);
  const teSchrappen = new Set(
    ZWAKKER_DAN.filter(([, sterk]) => aanwezig.has(sterk)).map(([zwak]) => zwak)
  );
  return signalen.filter((signaal) => !teSchrappen.has(signaal));
}
