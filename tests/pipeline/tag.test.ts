import { describe, it, expect } from "vitest";
import { tagLine } from "@/lib/pipeline/tag";
import { makeAdapter } from "@/lib/ai/adapter";

describe("tagLine", () => {
  it("returns structured tags parsed from the adapter and persists them", async () => {
    const adapter = makeAdapter(async () => '{"material":"ceramic","dimensions":"60x60","category":"floor","standardRefs":["م.ق.أ 374/1"]}');
    const tags = await tagLine(adapter, `tiling_${Date.now()}`, {
      sortOrder: 0, sectionRef: "5", descriptionOriginal: "بلاط سيراميك 60x60 حسب م.ق.أ 374/1",
    });
    expect(tags.material).toBe("ceramic");
    expect(tags.standardRefs).toContain("م.ق.أ 374/1");
  });
});
