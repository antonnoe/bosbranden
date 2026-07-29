// Eén endpoint voor de AI-duider (requirement 1). ANTHROPIC_API_KEY staat
// UITSLUITEND server-side (deze route) — hij komt in geen enkele client-bundle.
// Het model krijgt geen tools en geen internettoegang (requirement 2): de context
// komt alleen uit de eigen API-routes. Volgorde van de begrenzingen:
//   1. noodsignaal-omleiding VÓÓR elke modelaanroep (requirement 3),
//   2. IP-daglimiet (requirement 5),
//   3. contextopbouw + modelaanroep (laag max_tokens, gecachet — requirement 6),
//   4. URL-filter op de uitvoer (requirement 4).

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEMPROMPT } from "@/data/assistent-prompt";
import { NOODANTWOORD } from "@/data/noodsignalen";
import { bevatNoodsignaal, filterUrls } from "@/lib/assistent-filter";
import { verbruikLimiet, leesIp, LIMIET_MELDING } from "@/lib/assistent-limiet";
import {
  bouwDuidingContext,
  bouwUitlegContext,
  leesMetingPayload,
} from "@/lib/assistent-context";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 400; // korte antwoorden zijn hier een kwaliteitseis (requirement 6)
const MAX_VRAAG = 500;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ antwoord: "Ongeldig verzoek." }, { status: 400 });
  }

  const modus = body.modus === "uitleg" ? "uitleg" : "duiding";

  // ---- 1. Noodsignaal VÓÓR de modelaanroep (en vóór de limiet) ----
  // Alleen relevant bij een vrije gebruikersvraag; een detectie-uitleg bevat
  // geen gebruikerstekst. Dit pad raakt de Anthropic-client nooit aan.
  const ruweVraag = typeof body.vraag === "string" ? body.vraag.slice(0, MAX_VRAAG) : "";
  if (modus === "duiding" && ruweVraag && bevatNoodsignaal(ruweVraag)) {
    return NextResponse.json({ antwoord: NOODANTWOORD, noodsignaal: true, bron: "vast" });
  }

  // ---- 2. IP-daglimiet ----
  const ip = leesIp(request.headers);
  const limiet = verbruikLimiet(ip);
  if (!limiet.toegestaan) {
    return NextResponse.json({ antwoord: LIMIET_MELDING, limiet: true }, { status: 429 });
  }

  const basisUrl = new URL(request.url).origin;

  try {
    // ---- 3. Uitleg-modus (Leg uit-knop): gecachet op meting-id + datum ----
    if (modus === "uitleg") {
      const meting = leesMetingPayload(body.meting);
      if (!meting) {
        return NextResponse.json({ antwoord: "Geen geldige meetgegevens." }, { status: 400 });
      }
      const antwoord = await uitlegGecachet(meting.id, meting.waargenomenOp, () => {
        const context = bouwUitlegContext(meting);
        const userText = `${context}\n\nVRAAG: Duid deze cijfers in twee à drie korte zinnen voor een gewone lezer, met een schaalreferentie voor FRP.`;
        return genereer(userText);
      });
      return NextResponse.json({ antwoord, bron: "model" });
    }

    // ---- 3. Duiding-modus (postcode) ----
    const postcode = String(body.postcode ?? "").replace(/\D/g, "").slice(0, 5);
    if (postcode.length !== 5) {
      return NextResponse.json(
        { antwoord: "Vul een Franse postcode van vijf cijfers in." },
        { status: 400 }
      );
    }

    if (ruweVraag) {
      // Vrije vervolgvraag: niet gecachet (te gevarieerd), wel dezelfde context.
      const ctx = await bouwDuidingContext(postcode, basisUrl);
      if ("fout" in ctx) return NextResponse.json({ antwoord: ctx.fout });
      const userText = `${ctx.context}\n\nVRAAG van de gebruiker: ${ruweVraag}\n\nBeantwoord uitsluitend op basis van de CONTEXT hierboven, volgens de regels.`;
      return NextResponse.json({ antwoord: await genereer(userText), bron: "model" });
    }

    // Standaardvraag (samenvatting): gecachet op postcode (requirement 6).
    const antwoord = await duidingGecachet(postcode, basisUrl);
    return NextResponse.json({ antwoord, bron: "model" });
  } catch {
    return NextResponse.json({
      antwoord:
        "De duiding kon nu niet worden opgehaald. Probeer het later opnieuw. Volg bij gevaar altijd 112, FR-Alert en de prefectuur.",
    });
  }
}

// Roept het model aan — GEEN tools, GEEN internettoegang — en filtert de uitvoer
// op toegestane links (requirement 4).
async function genereer(userText: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return "De duider is nu niet beschikbaar. De kaart, de postcode-check en het nieuws werken gewoon.";
  }
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEMPROMPT,
    messages: [{ role: "user", content: userText }],
  });
  if (res.stop_reason === "refusal") {
    return "De duider kan hier geen antwoord op geven. Volg bij gevaar altijd 112, FR-Alert en de prefectuur.";
  }
  const tekst = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return filterUrls(tekst) || "Er kwam geen antwoord terug. Probeer het later opnieuw.";
}

function duidingGecachet(postcode: string, basisUrl: string): Promise<string> {
  return unstable_cache(
    async () => {
      const ctx = await bouwDuidingContext(postcode, basisUrl);
      if ("fout" in ctx) return ctx.fout;
      const userText = `${ctx.context}\n\nVRAAG: Geef een korte, feitelijke samenvatting van wat dit op dit moment voor deze postcode betekent (twee tot vijf zinnen), volgens de regels.`;
      return genereer(userText);
    },
    ["assistent-duiding-v1", postcode],
    { revalidate: 1800 } // 30 min: schaalt met postcodes, niet met bezoekers
  )();
}

function uitlegGecachet(
  id: string,
  waargenomenOp: string | undefined,
  maak: () => Promise<string>
): Promise<string> {
  const dag = (waargenomenOp ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  return unstable_cache(maak, ["assistent-uitleg-v1", id, dag], { revalidate: 86400 })();
}
