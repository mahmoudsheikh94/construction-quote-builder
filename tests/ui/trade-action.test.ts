import { describe, it, expect } from "vitest";
import { saveTradeCore, rollbackCore } from "@/app/(app)/trades/[slug]/actions";
import { getActiveSkill } from "@/lib/db/skills";

const content = (markup: string) => ({
  trade: "ui-tiling", costModels: [{
    id: "ui-tiling.floor", labelAr: "بلاط", unit: "m2" as const, keywords: ["بلاط"],
    components: [{ id: "m", kind: "material" as const, labelAr: "بلاط", priceBookKey: "tile_m2", qtyPerUnit: "1" }],
    wastePct: "5", markupPct: markup,
  }],
});

describe("trade editor actions", () => {
  it("save creates+activates a new version; rollback re-activates an older one", async () => {
    const slug = `ui-tiling-${Date.now()}`;
    await saveTradeCore({ slug, nameAr: "أعمال البلاط", content: { ...content("15"), trade: slug }, changelog: "أول" });
    const v1 = await getActiveSkill(slug);
    expect(v1?.content.costModels[0].markupPct).toBe("15");
    expect(v1?.versionNumber).toBe(1);

    await saveTradeCore({ slug, nameAr: "أعمال البلاط", content: { ...content("20"), trade: slug }, changelog: "رفع الربح" });
    const v2 = await getActiveSkill(slug);
    expect(v2?.versionNumber).toBe(2);
    expect(v2?.content.costModels[0].markupPct).toBe("20");

    // rollback to v1
    const { listSkillVersions } = await import("@/lib/db/skills");
    const { serviceClient } = await import("@/lib/db/client");
    const { data: skill } = await serviceClient().from("trade_skills").select("id").eq("slug", slug).single();
    const versions = await listSkillVersions(skill!.id);
    const v1id = versions.find((v) => v.versionNumber === 1)!.id;
    await rollbackCore(slug, v1id);
    expect((await getActiveSkill(slug))?.versionNumber).toBe(1);
  });

  it("rejects invalid content via the schema", async () => {
    await expect(saveTradeCore({ slug: `bad-${Date.now()}`, nameAr: "سيئ", content: { trade: "x", costModels: [{ nope: true }] } as never, changelog: "x" })).rejects.toThrow();
  });
});
