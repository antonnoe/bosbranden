// FR-Alert stuurt een onvolledige certificaatketen (leaf zonder intermediate),
// waardoor Node's fetch faalt met UNABLE_TO_VERIFY_LEAF_SIGNATURE. We lossen dat
// op door het ontbrekende intermediate zelf op te halen — bij voorkeur via de
// AIA-URL uit de leaf (blijft werken na certificaatvernieuwing), met een
// meegeleverde PEM als terugval — en het als extra vertrouwensanker in een
// https.Agent te zetten die we uitsluitend voor de FR-Alert-fetches gebruiken.

import https from "node:https";
import tls from "node:tls";

const CACHE_MS = 6 * 60 * 60 * 1000; // 6 uur

// Terugval-intermediate (PEM). Leeg laten tenzij de AIA-route structureel faalt;
// dan kan hier het intermediate uit ?debug=chain worden ingeplakt. De AIA-route
// heeft de voorkeur omdat die automatisch meebeweegt met certificaatvernieuwing.
const FALLBACK_INTERMEDIATE_PEM = "";

interface KetenInfo {
  host: string;
  subject: tls.PeerCertificate["subject"] | null;
  issuer: tls.PeerCertificate["issuer"] | null;
  valid_from: string | null;
  valid_to: string | null;
  aiaCaIssuers: string[] | null;
  ocsp: string[] | null;
  serverStuurtIntermediate: boolean;
}

let agentCache: { agent: https.Agent; tijd: number } | null = null;

// Leest de certificaatketen van de host uit (diagnose). Verifieert bewust niet,
// zodat ook een onvolledige keten uitleesbaar is.
export function leesKetenInfo(host: string): Promise<KetenInfo> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10_000 },
      () => {
        const leaf = socket.getPeerCertificate(true);
        socket.end();
        if (!leaf || Object.keys(leaf).length === 0) {
          reject(new Error("geen leaf-certificaat ontvangen"));
          return;
        }
        const infoAccess = (leaf.infoAccess ?? {}) as Record<string, string[]>;
        // De server stuurt een intermediate mee als de leaf naar een ander
        // certificaat verwijst dan zichzelf.
        const serverStuurtIntermediate =
          !!leaf.issuerCertificate &&
          leaf.issuerCertificate.fingerprint !== leaf.fingerprint;
        resolve({
          host,
          subject: leaf.subject ?? null,
          issuer: leaf.issuer ?? null,
          valid_from: leaf.valid_from ?? null,
          valid_to: leaf.valid_to ?? null,
          aiaCaIssuers: infoAccess["CA Issuers - URI"] ?? null,
          ocsp: infoAccess["OCSP - URI"] ?? null,
          serverStuurtIntermediate,
        });
      }
    );
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS-verbinding time-out"));
    });
  });
}

// Haalt het intermediate op via de AIA-URL (CA Issuers) uit de leaf.
async function haalIntermediateViaAia(host: string): Promise<string> {
  const info = await leesKetenInfo(host);
  const urls = info.aiaCaIssuers ?? [];
  if (urls.length === 0) throw new Error("geen AIA CA-Issuers-URL in de leaf");

  let laatsteFout: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`AIA-download ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return naarPem(buf);
    } catch (fout) {
      laatsteFout = fout;
    }
  }
  throw laatsteFout instanceof Error ? laatsteFout : new Error("AIA-download mislukt");
}

// Zet een certificaat (DER of al PEM) om naar PEM.
function naarPem(buf: Buffer): string {
  const alsTekst = buf.toString("latin1");
  if (alsTekst.includes("-----BEGIN CERTIFICATE-----")) {
    return buf.toString("utf8");
  }
  const b64 = buf.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

// Bouwt (en cachet) een https.Agent die de Node-roots uitbreidt met het
// ontbrekende intermediate. Faalt de AIA-route én is er geen terugval-PEM, dan
// levert dit een agent met alleen de standaardroots — de fetch faalt dan zoals
// voorheen en de route valt terug op de laatst bekende momentopname.
export async function frAlertAgent(host: string): Promise<https.Agent> {
  if (agentCache && Date.now() - agentCache.tijd < CACHE_MS) return agentCache.agent;

  let intermediate: string | null = null;
  try {
    intermediate = await haalIntermediateViaAia(host);
  } catch {
    intermediate = FALLBACK_INTERMEDIATE_PEM || null;
  }

  const ca = [...tls.rootCertificates, ...(intermediate ? [intermediate] : [])];
  const agent = new https.Agent({ ca, keepAlive: true });

  // Alleen cachen wanneer we het intermediate daadwerkelijk hebben; anders bij
  // de volgende aanvraag opnieuw proberen in plaats van 6 uur op een
  // roots-only-agent blijven hangen.
  if (intermediate) agentCache = { agent, tijd: Date.now() };
  return agent;
}

// GET met de custom-CA agent, volgt redirects. Node's fetch negeert een
// https.Agent, dus we gebruiken node:https rechtstreeks.
export function httpsTekst(
  url: string,
  agent: https.Agent,
  headers: Record<string, string>,
  redirectsOver = 5
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { agent, method: "GET", headers, timeout: 12_000 },
      (res) => {
        const status = res.statusCode ?? 0;
        const locatie = res.headers.location;
        if (locatie && [301, 302, 303, 307, 308].includes(status) && redirectsOver > 0) {
          res.resume();
          const volgende = new URL(locatie, url).toString();
          httpsTekst(volgende, agent, headers, redirectsOver - 1).then(resolve, reject);
          return;
        }
        const brokken: Buffer[] = [];
        res.on("data", (c: Buffer) => brokken.push(c));
        res.on("end", () =>
          resolve({ status, body: Buffer.concat(brokken).toString("utf8") })
        );
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("HTTP-verzoek time-out"));
    });
    req.end();
  });
}
