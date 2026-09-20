/** Original disambiguations where first-clause glosses collide within a road. */
const OVERRIDES: Readonly<Record<string, string>> = {
  先: "previous", 前: "before", 所: "location", 場: "place", 用: "usage", 使: "use",
  京: "capital", 都: "metropolis", 転: "revolve", 回: "times", 世: "generation", 界: "world",
  医: "medical care", 薬: "medicine",
};
export function keywordFor(character: string, meaning: string): string {
  return OVERRIDES[character] ?? meaning.split(/[;,]/)[0]!.trim();
}
