// Pure orchestratielogica voor het ophalen van samenvattingen (B2/B3/B4),
// bewust zonder Next- of netwerk-import zodat ze los te testen is.
//
// Het budget beperkt het aantal NIEUWE (niet-gecachete) samenvattingen per
// regeneratie: `metGate` draait alléén in het cache-miss-pad en telt daar één
// aftrek. Een cache-hit raakt het budget dus niet. Is het budget op, dan gooit
// `metGate` (→ Franse terugval, niets gecachet, volgende ronde opnieuw).

export interface Budget {
  over: number;
}

// Aanroepen ván binnen het cache-miss-pad: alleen dan telt een nieuwe generatie.
// De check-en-aftrek staat vóór de eerste await, dus bij parallelle misses gaan
// er nooit méér dan `budget.over` door.
export async function metGate<T>(budget: Budget, genereer: () => Promise<T>): Promise<T> {
  if (budget.over <= 0) {
    throw new Error("samenvattingsbudget voor deze ronde is op");
  }
  budget.over -= 1;
  return genereer();
}

// Haalt voor elke sleutel (artikel-URL) parallel het resultaat op via `haal`,
// die zelf een durable read-through-cache is. Mislukt een sleutel (budget op of
// een echte fout), dan levert die `null` en blijft de rest staan (B4). Deelt één
// budget over álle sleutels heen, zodat het maximum per regeneratie klopt.
export async function haalAlle<T>(
  sleutels: string[],
  maxNieuw: number,
  haal: (sleutel: string, budget: Budget) => Promise<T>
): Promise<Map<string, T | null>> {
  const budget: Budget = { over: maxNieuw };
  const paren = await Promise.all(
    sleutels.map(async (sleutel) => {
      try {
        return [sleutel, await haal(sleutel, budget)] as const;
      } catch {
        return [sleutel, null] as const;
      }
    })
  );
  return new Map(paren);
}
