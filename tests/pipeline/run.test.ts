import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "@/lib/pipeline/run";
import { makeAdapter } from "@/lib/ai/adapter";
import { createProfile, createProfileVersion, activateProfileVersion } from "@/lib/db/skills";
import { persistReviewedSkill } from "@/lib/seed/seed-from-priced";
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";

const profileSlug = `resi_${Date.now()}`;
const tradeSlug = `tiling_run_${Date.now()}`;
const boq = "tests/fixtures/run-boq.xlsx";

beforeAll(async () => {
  mkdirSync("tests/fixtures", { recursive: true });
  const rows = [["الرقم", "وصف البند", "الوحدة", "الكمية"], ["5/4", "بلاط سيراميك أرضيات", "م2", "2700"]];
  const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  writeFileSync(boq, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  await persistReviewedSkill(tradeSlug, "أعمال البلاط", {
    trade: tradeSlug,
    costModels: [{
      id: `${tradeSlug}.ceramic_floor`, labelAr: "بلاط سيراميك", unit: "m2", keywords: ["سيراميك", "بلاط"],
      components: [
        { id: "tile", kind: "material", labelAr: "بلاط", priceBookKey: `tile_${tradeSlug}`, qtyPerUnit: "1" },
        { id: "mortar", kind: "material", labelAr: "مونة", priceBookKey: `mortar_${tradeSlug}`, qtyPerUnit: "1" },
        { id: "tiler", kind: "labor", labelAr: "مبلط", priceBookKey: `tiler_${tradeSlug}`, productivityPerDay: "15" },
      ],
      wastePct: "5", markupPct: "15",
    }],
  }, [
    { key: `tile_${tradeSlug}`, labelAr: "بلاط", unit: "m2", priceFils: 8000 },
    { key: `mortar_${tradeSlug}`, labelAr: "مونة", unit: "m2", priceFils: 1500 },
    { key: `tiler_${tradeSlug}`, labelAr: "مبلط", unit: "day", priceFils: 25000 },
  ]);

  const { id } = await createProfile(profileSlug, "سكني");
  const pv = await createProfileVersion(id, { trades: [tradeSlug], ratioChecks: [] }, "v1");
  await activateProfileVersion(id, pv.id);
});

describe("runPipeline (end to end, fake adapter)", () => {
  it("ingests → tags → matches → prices an Excel BOQ", async () => {
    // Fake adapter answers both the tag call and the semantic-match call by shape.
    const adapter = makeAdapter(async (req) => {
      if (req.prompt.includes("نماذج التسعير المتاحة")) return `{"costModelId":"${tradeSlug}.ceramic_floor","confidence":0.9}`;
      return '{"material":"ceramic","dimensions":"60x60","category":"floor"}';
    });
    const out = await runPipeline({ file: boq, profileSlug, adapter });
    const row = out.rows.find((r) => r.itemCode === "5/4")!;
    expect(row.rateJD).toBe("13.388");             // Phase 1 pricing, proven
    expect(row.amountJD).toBe("36147.600");        // 2700 × 13.388
    expect(out.rollup.grandTotalFils).toBe(36_147_600);
  });
});
