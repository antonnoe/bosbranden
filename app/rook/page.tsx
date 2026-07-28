import type { Metadata } from "next";
import Rookmodule from "@/components/Rookmodule";

export const metadata: Metadata = {
  title: "Verwachte rookverplaatsing — Weer en waarschuwingen Frankrijk",
  description:
    "De berekende windbaan vanaf gedetecteerde hittebronnen in Frankrijk: waar waait de lucht naartoe, op leefniveau en op hoogte. Geen rookmodel. Bronnen: NASA FIRMS (VIIRS) en Open-Meteo (wind).",
};

export default async function RookPagina({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const params = await searchParams;
  return <Rookmodule embed={params.embed === "1"} />;
}
