import { describe, it, expect } from "vitest";
import { draftTradeSkill, persistReviewedSkill } from "@/lib/seed/seed-from-priced";
import { getActiveSkill } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import { makeAdapter } from "@/lib/ai/adapter";

const draftJson = JSON.stringify({
  skill: {
    trade: "tiling",
    costModels: [{
      id: "tiling.ceramic_floor", labelAr: "بلاط سيراميك أرضيات", unit: "m2", keywords: ["سيراميك"],
      components: [
        { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
        { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
      ],
      wastePct: "5", markupPct: "15",
    }],
  },
  priceBook: [
    { key: "ceramic_tile_m2", labelAr: "بلاط سيراميك", unit: "m2", priceFils: 8000 },
    { key: "tiler_day_rate", labelAr: "أجرة مبلط", unit: "day", priceFils: 25000 },
  ],
});

describe("seeding", () => {
  it("drafts a schema-valid skill + price book from an example", async () => {
    const adapter = makeAdapter(async () => draftJson);
    const draft = await draftTradeSkill(adapter, "tiling", "reference-docs/example.pdf");
    expect(draft.skill.costModels[0].id).toBe("tiling.ceramic_floor");
    expect(draft.priceBook).toHaveLength(2);
  });

  it("persists a reviewed skill: price book entries + an active skill version", async () => {
    const adapter = makeAdapter(async () => draftJson);
    const slug = `tiling_seed_${Date.now()}`;
    const draft = await draftTradeSkill(adapter, "tiling", "x");
    await persistReviewedSkill(slug, "أعمال البلاط", draft.skill, draft.priceBook);
    const active = await getActiveSkill(slug);
    expect(active?.content.costModels[0].id).toBe("tiling.ceramic_floor");
    const snap = await getSnapshot();
    expect(snap["ceramic_tile_m2"]?.priceFils).toBe(8000);
  });
});
