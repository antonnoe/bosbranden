import Tool from "@/components/Tool";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const params = await searchParams;
  return <Tool embed={params.embed === "1"} />;
}
