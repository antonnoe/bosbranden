import Tool from "@/components/Tool";
import RookKaart from "@/components/RookKaart";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const params = await searchParams;
  const embed = params.embed === "1";

  return (
    <>
      <Tool embed={embed} />
      <RookKaart />
    </>
  );
}
