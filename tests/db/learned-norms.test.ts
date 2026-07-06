import { describe, it, expect, afterAll } from "vitest";
import { getLearnedNorms, upsertLearnedNorm } from "@/lib/db/learned-norms";
import { getOptimismUplift, getScopeTemplate } from "@/lib/db/risk-seed";
import { serviceClient } from "@/lib/db/client";

const KEY = `test:${Date.now()}`;

describe("learned-norms + risk-seed repos", () => {
  afterAll(async () => {
    await serviceClient().from("learned_norms").delete().eq("scope", "productivity").eq("key", KEY);
  });

  it("upserts and reads back a learned norm", async () => {
    await upsertLearnedNorm({ scope: "productivity", key: KEY, value: 12.5, sampleSize: 3 });
    const map = await getLearnedNorms();
    expect(map.get(`productivity ${KEY}`)?.value).toBe(12.5);
    expect(map.get(`productivity ${KEY}`)?.sampleSize).toBe(3);
  });

  it("reads the seeded optimism grid + scope template", async () => {
    expect(await getOptimismUplift("standard_building", 5)).toBe(24);
    expect(await getOptimismUplift("non_standard_civil", 1)).toBe(4);
    const tpl = await getScopeTemplate("building");
    expect(tpl).toContain("concrete");
  });
});
