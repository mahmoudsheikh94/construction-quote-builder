import { describe, it, expect } from "vitest";
import {
  createSkill, createSkillVersion, activateSkillVersion,
  getActiveSkill, listSkillVersions,
} from "@/lib/db/skills";
import { testClient } from "../helpers/db";
import type { SkillContent } from "@/lib/domain/skill-schema";

const content = (markup: string): SkillContent => ({
  trade: "tiling",
  costModels: [{
    id: "tiling.ceramic_floor",
    labelAr: "بلاط سيراميك أرضيات",
    unit: "m2",
    keywords: ["سيراميك", "بلاط"],
    components: [
      { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: "ceramic_tile_m2", qtyPerUnit: "1" },
      { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: "tiler_day_rate", productivityPerDay: "15" },
    ],
    wastePct: "5",
    markupPct: markup,
  }],
});

describe("trade skills versioning", () => {
  it("creates versions, activates explicitly, rolls back", async () => {
    const slug = `tiling_${Date.now()}`;
    const skill = await createSkill(slug, "أعمال البلاط");

    const v1 = await createSkillVersion(skill.id, content("15"), "الإصدار الأول");
    expect(v1.versionNumber).toBe(1);
    expect(await getActiveSkill(slug)).toBeNull(); // creation ≠ activation

    await activateSkillVersion(skill.id, v1.id);
    const active1 = await getActiveSkill(slug);
    expect(active1?.content.costModels[0].markupPct).toBe("15");

    const v2 = await createSkillVersion(skill.id, content("18"), "رفع هامش الربح");
    expect(v2.versionNumber).toBe(2);
    await activateSkillVersion(skill.id, v2.id);
    expect((await getActiveSkill(slug))?.versionNumber).toBe(2);

    // rollback = activate the older version
    await activateSkillVersion(skill.id, v1.id);
    expect((await getActiveSkill(slug))?.versionNumber).toBe(1);

    expect(await listSkillVersions(skill.id)).toHaveLength(2);
  });

  it("rejects direct mutation of a version's content (DB trigger)", async () => {
    const slug = `concrete_${Date.now()}`;
    const skill = await createSkill(slug, "أعمال الخرسانة");
    const v1 = await createSkillVersion(skill.id, { ...content("10"), trade: "concrete" }, "أول");
    const { error } = await testClient()
      .from("skill_versions")
      .update({ content: { hacked: true } })
      .eq("id", v1.id);
    expect(error).not.toBeNull();
  });

  it("rejects invalid content via zod", async () => {
    const skill = await createSkill(`bad_${Date.now()}`, "سيئ");
    await expect(
      createSkillVersion(skill.id, { trade: "x", costModels: [{ nope: true }] } as never, "سيئ"),
    ).rejects.toThrow();
  });
});
