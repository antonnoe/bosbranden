import type { Metadata } from "next";
import Start from "@/components/Start";

export const metadata: Metadata = {
  title: "Weer en waarschuwingen Frankrijk — startscherm",
  description:
    "Startscherm met tegels: brandgevaar, hittebronnen, rookverplaatsing en officiële meldingen voor Frankrijk. Kies een onderdeel en vul eventueel uw postcode in.",
};

export default async function StartPagina({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const params = await searchParams;
  return <Start embed={params.embed === "1"} />;
}
