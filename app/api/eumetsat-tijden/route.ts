// EUMETSAT geostationaire lagen (MTG) ververst elke tien minuten. Het
// beschikbare tijdvenster halen we uit de WMS-GetCapabilities in plaats van het
// te berekenen: de laatste beschikbare frame loopt achter op de kloktijd. We
// geven de laatste twaalf tijdstippen (twee uur, stappen van tien minuten)
// terug, zodat de client daar een tijdlus over kan draaien.

export const runtime = "nodejs";
export const revalidate = 300; // 5 minuten

const CAPS_URL =
  "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities";
const TOEGESTANE_LAGEN = new Set(["mtg_fd:rgb_dust", "mtg_fd:frp", "mtg_fd:rgb_firetemperature"]);
const STANDAARD_LAAG = "mtg_fd:rgb_dust";
const STAP_MS = 10 * 60 * 1000; // tien minuten
const AANTAL_FRAMES = 12; // twee uur

export async function GET(request: Request) {
  const gevraagd = new URL(request.url).searchParams.get("laag") ?? STANDAARD_LAAG;
  const laag = TOEGESTANE_LAGEN.has(gevraagd) ? gevraagd : STANDAARD_LAAG;

  try {
    const res = await fetch(CAPS_URL, {
      headers: { Accept: "text/xml,application/xml" },
      signal: AbortSignal.timeout(20_000),
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`GetCapabilities status ${res.status}`);
    const xml = await res.text();

    const extent = leesTijdExtent(xml, laag);
    if (!extent) throw new Error("tijd-extent niet gevonden");

    const laatste = bepaalLaatste(extent);
    if (!laatste) throw new Error("laatste tijdstip niet af te leiden");

    // Twaalf frames terug vanaf het laatst beschikbare tijdstip, oplopend in tijd.
    const reeks: string[] = [];
    for (let i = AANTAL_FRAMES - 1; i >= 0; i -= 1) {
      reeks.push(new Date(laatste.getTime() - i * STAP_MS).toISOString());
    }

    return Response.json(
      { beschikbaar: true, laag, stapSeconden: STAP_MS / 1000, laatste: laatste.toISOString(), reeks },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    return Response.json(
      {
        beschikbaar: false,
        laag,
        opmerking:
          "Het tijdvenster van de geostationaire laag kon niet worden opgehaald (GetCapabilities onbereikbaar of geen tijd-dimensie).",
        fout: err instanceof Error ? err.message : String(err),
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// Zoekt binnen de GetCapabilities de tijd-dimensie van de opgegeven laag. In
// WMS 1.3.0 staat die als <Dimension name="time" ...>INHOUD</Dimension> ná de
// <Name> van de laag. De inhoud is een extent: "start/eind/periode" of een
// door komma's gescheiden lijst.
function leesTijdExtent(xml: string, laag: string): string | null {
  const naamIndex = xml.indexOf(`<Name>${laag}</Name>`);
  if (naamIndex < 0) return null;

  // Eerst de moderne 1.3.0-vorm (Dimension met inhoud), anders de oude
  // 1.1.1-vorm (aparte <Extent name="time">).
  for (const tag of ["Dimension", "Extent"]) {
    const dimIndex = xml.indexOf('name="time"', naamIndex);
    if (dimIndex < 0) continue;
    const openTag = xml.lastIndexOf("<", dimIndex);
    // controleer dat dit ook echt het gezochte tag-type is
    if (xml.slice(openTag, dimIndex).indexOf(tag) < 0) continue;
    const sluitPunt = xml.indexOf(">", dimIndex);
    const eind = xml.indexOf(`</${tag}>`, sluitPunt);
    if (sluitPunt < 0 || eind < 0) continue;
    const inhoud = xml.slice(sluitPunt + 1, eind).trim();
    if (inhoud) return inhoud;
  }
  return null;
}

// Leidt het laatst beschikbare tijdstip af uit een extent-string.
function bepaalLaatste(extent: string): Date | null {
  if (extent.includes("/")) {
    // "start/eind/periode": het tweede deel is het eindtijdstip.
    const eind = extent.split("/")[1]?.trim();
    const d = eind ? new Date(eind) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  // Kommalijst: neem het laatste geldige tijdstip.
  const delen = extent.split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = delen.length - 1; i >= 0; i -= 1) {
    const d = new Date(delen[i]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
