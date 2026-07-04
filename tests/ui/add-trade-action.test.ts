import { describe, it, expect } from "vitest";
import { createTradeCore } from "@/app/(app)/trades/[slug]/core";
import { getActiveSkill } from "@/lib/db/skills";
import { getSnapshot } from "@/lib/db/price-book";
import { testClient } from "../helpers/db";

const db = testClient();

describe("createTrade (add-trade popup)", () => {
  it("creates a trade with one cost model + a linked price-book entry, active at v1", async () => {
    const slug = `painting-${Date.now()}`;
    await createTradeCore({
      slug,
      nameAr: "أعمال الدهان",
      modelLabelAr: "دهان جدران",
      unit: "m2",
      priceJD: "5.000",
      markupPct: "10",
    }, db);

    // trade is active at version 1 with one model
    const active = await getActiveSkill(slug, db);
    expect(active?.versionNumber).toBe(1);
    expect(active?.content.trade).toBe(slug);
    expect(active?.content.costModels).toHaveLength(1);
    const model = active!.content.costModels[0];
    expect(model.labelAr).toBe("دهان جدران");
    expect(model.unit).toBe("m2");
    expect(model.markupPct).toBe("10");
    expect(model.components[0].priceBookKey).toBe(`${slug}_m2`);

    // the linked price landed in the price book (JD→fils)
    const snap = await getSnapshot(undefined, db);
    expect(snap[`${slug}_m2`].priceFils).toBe(5000);
  });

  it("defaults markup to 0 when blank", async () => {
    const slug = `plastering-${Date.now()}`;
    await createTradeCore({
      slug, nameAr: "قصارة", modelLabelAr: "قصارة إسمنتية", unit: "m2", priceJD: "8.500", markupPct: "",
    }, db);
    const active = await getActiveSkill(slug, db);
    expect(active?.content.costModels[0].markupPct).toBe("0");
  });
});
