// Meet hoe vers /api/nieuws werkelijk is, vanaf een machine mét netwerktoegang.
// Draaien:  node scripts/meet-nieuws-cache.mjs [basis-url] [aantal]
// Bijvoorbeeld: node scripts/meet-nieuws-cache.mjs https://bosbranden.vercel.app 3
//
// WAAROM DIT BESTAAT. De storing van 26-08-2026 (eerste opening toonde de stand
// van 1 augustus, tweede opening de verse lichting) is een cachestoring, en die
// zie je alleen aan de HEADERS plus het veld `bijgewerkt` in het antwoord — niet
// aan de inhoud. Dit script zet die twee naast elkaar, zodat de vraag "hoe oud
// is wat een bezoeker krijgt" met een getal te beantwoorden is in plaats van
// met een vermoeden.
//
// Wat je wilt zien na de omzetting naar een dynamische route:
//   - x-vercel-cache: MISS, HIT of STALE — maar `leeftijd` blijft klein;
//   - `leeftijd` (nu minus `bijgewerkt`) ruim onder het uur;
//   - de tweede en derde meting tonen GEEN sprong van weken.
// Zie je bij meting 1 een leeftijd van dagen en bij meting 2 een verse waarde,
// dan is de ISR-cache terug.

const basis = process.argv[2] ?? "https://bosbranden.vercel.app";
const rondes = Number(process.argv[3] ?? 3);

function duur(ms) {
  if (!Number.isFinite(ms)) return "onbekend";
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const u = Math.round(m / 60);
  if (u < 48) return `${u} uur`;
  return `${Math.round(u / 24)} dagen`;
}

console.log(`Meting van ${basis}/api/nieuws — ${rondes} ronde(n)\n`);

let vorigeBijgewerkt = null;

for (let i = 1; i <= rondes; i += 1) {
  const start = Date.now();
  let res;
  try {
    res = await fetch(`${basis}/api/nieuws`, { cache: "no-store" });
  } catch (fout) {
    console.log(`ronde ${i}: ophalen mislukt — ${fout.message}`);
    continue;
  }
  const ms = Date.now() - start;
  const json = await res.json().catch(() => null);

  const bijgewerkt = json?.bijgewerkt ?? null;
  const leeftijd = bijgewerkt ? Date.now() - Date.parse(bijgewerkt) : NaN;
  const items = json ? (json.officieel?.length ?? 0) + (json.pers?.length ?? 0) : 0;
  const geweigerd = (json?.bronnen ?? []).reduce((n, b) => n + (b.geweigerd ?? 0), 0);

  console.log(`ronde ${i}  (${ms} ms)`);
  console.log(`  status            ${res.status}`);
  console.log(`  x-vercel-cache    ${res.headers.get("x-vercel-cache") ?? "—"}`);
  console.log(`  age               ${res.headers.get("age") ?? "—"}`);
  console.log(`  cache-control     ${res.headers.get("cache-control") ?? "—"}`);
  console.log(`  bijgewerkt        ${bijgewerkt ?? "—"}`);
  console.log(`  LEEFTIJD          ${duur(leeftijd)}${leeftijd > 3600_000 ? "   ← ouder dan een uur" : ""}`);
  console.log(`  items in de lade  ${items}`);
  console.log(`  door zeef geweerd ${geweigerd}`);

  if (vorigeBijgewerkt && bijgewerkt && vorigeBijgewerkt !== bijgewerkt) {
    const sprong = Date.parse(bijgewerkt) - Date.parse(vorigeBijgewerkt);
    console.log(`  SPRONG t.o.v. vorige ronde: ${duur(sprong)}`);
    if (sprong > 3600_000) {
      console.log("  → dit is het patroon van 26-08: eerste aanvraag serveert een oude");
      console.log("    bewaarde versie en trapt pas dán de vernieuwing af.");
    }
  }
  vorigeBijgewerkt = bijgewerkt;
  console.log("");
}
