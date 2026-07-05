import { describe, it, expect, afterAll } from "vitest";
import {
  insertGoldenCase, insertGoldenLines, getCaseBySlug, getGoldenLines, listScoredCases,
} from "@/lib/db/golden";
import { serviceClient } from "@/lib/db/client";

const SLUG = `test-case-${Date.now()}`;

describe("golden repo", () => {
  afterAll(async () => {
    await serviceClient().from("golden_cases").delete().eq("slug", SLUG);
  });

  it("inserts and reads back a scored case with lines", async () => {
    const { id } = await insertGoldenCase({
      slug: SLUG, nameAr: "اختبار", projectType: "civil",
      inputPath: "x.xlsx", pricedPath: "x.xlsx", profileSlug: "civil", truthSource: "priced-tender",
    });
    await insertGoldenLines(id, [
      {
        sortOrder: 0, itemCode: "1", descriptionOriginal: "concrete", unitCanonical: "m3",
        truthRateFils: 9000, truthAmountFils: 90000, trade: "concrete",
      },
    ]);
    const c = await getCaseBySlug(SLUG);
    expect(c?.pricedPath).toBe("x.xlsx");
    expect(c?.truthSource).toBe("priced-tender");

    const lines = await getGoldenLines(id);
    expect(lines).toHaveLength(1);
    expect(lines[0].truthRateFils).toBe(9000);
    expect(lines[0].trade).toBe("concrete");

    const scored = await listScoredCases();
    expect(scored.some((s) => s.slug === SLUG)).toBe(true);
  });
});
