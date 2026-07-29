// Eenvoudige IP-gebaseerde daglimiet voor de assistent (requirement 5). Bewust
// simpel: een teller per IP per dag in het geheugen van de serverinstantie. Bij
// een koude start begint de teller opnieuw — voor een gratis, misbruikbeperkende
// rem is dat voldoende; het doel is niet een harde quotumadministratie maar
// voorkomen dat één bezoeker de kosten laat oplopen.

export const LIMIET_PER_DAG = 20;

interface Stand {
  dag: string; // YYYY-MM-DD
  aantal: number;
}

const tellers = new Map<string, Stand>();

// Verbruikt één vraag voor dit IP en meldt of het nog mag. Roep dit één keer per
// modelgebonden verzoek aan (noodsignaal-antwoorden gaan eromheen).
export function verbruikLimiet(ip: string): { toegestaan: boolean; resterend: number } {
  const dag = new Date().toISOString().slice(0, 10);
  const huidig = tellers.get(ip);

  if (!huidig || huidig.dag !== dag) {
    tellers.set(ip, { dag, aantal: 1 });
    return { toegestaan: true, resterend: LIMIET_PER_DAG - 1 };
  }
  if (huidig.aantal >= LIMIET_PER_DAG) {
    return { toegestaan: false, resterend: 0 };
  }
  huidig.aantal += 1;
  return { toegestaan: true, resterend: LIMIET_PER_DAG - huidig.aantal };
}

// Leidt het bezoekers-IP af uit de gebruikelijke proxy-headers.
export function leesIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "onbekend";
}

export const LIMIET_MELDING =
  "U heeft vandaag het maximale aantal vragen aan de duider gebruikt " +
  `(${LIMIET_PER_DAG} per dag). Probeer het morgen opnieuw. De kaart, de ` +
  "postcode-check en het nieuws blijven gewoon werken.";
