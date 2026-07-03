import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "@/lib/pipeline/run";
import { makeAdapter } from "@/lib/ai/adapter";
import { createProfile, createProfileVersion, activateProfileVersion } from "@/lib/db/skills";
import { persistReviewedSkill } from "@/lib/seed/seed-from-priced";
import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";

const profileSlug = `resi_${Date.now()}`;
const tradeSlug = `tiling_run_${Date.now()}`;
const tradeSlug2 = `blockwork_run_${Date.now()}`;
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

// Second profile with TWO trades, used to prove tagLine is called once per line
// (not once per candidate trade). tradeSlug2 has its own (empty-matching) skill so
// the match loop must try both trades for the multi-trade test below.
const profileSlug2 = `resi2_${Date.now()}`;

beforeAll(async () => {
  await persistReviewedSkill(tradeSlug2, "أعمال البلوك", {
    trade: tradeSlug2,
    costModels: [{
      id: `${tradeSlug2}.block_wall`, labelAr: "بلوك", unit: "m2", keywords: ["بلوك"],
      components: [{ id: "block", kind: "material", labelAr: "بلوك", priceBookKey: `block_${tradeSlug2}`, qtyPerUnit: "1" }],
      wastePct: "5", markupPct: "15",
    }],
  }, [{ key: `block_${tradeSlug2}`, labelAr: "بلوك", unit: "m2", priceFils: 5000 }]);

  const { id } = await createProfile(profileSlug2, "سكني متعدد المهن");
  const pv = await createProfileVersion(id, { trades: [tradeSlug, tradeSlug2], ratioChecks: [] }, "v1");
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

  it("degrades a single bad line to NO_MATCH instead of aborting the whole run", async () => {
    // One line's AI calls throw (simulating an AISchemaError after retries exhausted);
    // the other line's calls succeed. The bad line must not abort pricing for the good one.
    const boq2 = "tests/fixtures/run-boq-partial-fail.xlsx";
    const rows = [
      ["الرقم", "وصف البند", "الوحدة", "الكمية"],
      ["1/1", "بند سيء يفشل الذكاء الاصطناعي", "م2", "10"],
      ["5/4", "بلاط سيراميك أرضيات", "م2", "2700"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    writeFileSync(boq2, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const adapter = makeAdapter(async (req) => {
      if (req.prompt.includes("بند سيء")) throw new Error("malformed AI response (simulated AISchemaError)");
      if (req.prompt.includes("نماذج التسعير المتاحة")) return `{"costModelId":"${tradeSlug}.ceramic_floor","confidence":0.9}`;
      return '{"material":"ceramic","dimensions":"60x60","category":"floor"}';
    });

    const out = await runPipeline({ file: boq2, profileSlug, adapter });

    const badRow = out.rows.find((r) => r.itemCode === "1/1")!;
    expect(badRow.rateJD).toBeNull();
    expect(badRow.flags).toContain("NO_MATCH");

    const goodRow = out.rows.find((r) => r.itemCode === "5/4")!;
    expect(goodRow.rateJD).toBe("13.388");
    expect(goodRow.amountJD).toBe("36147.600");
  });

  it("tags a line ONCE even when multiple candidate trades are tried, not once per trade", async () => {
    // Tags describe the line, not the trade — tagging per trade wastes AI calls and
    // writes duplicate line_item_tags rows. The first trade (tiling) must decline the
    // match (via a null costModelId) so the match loop proceeds to the second trade
    // (blockwork), which accepts it. tagLine must only run once regardless.
    const boq3 = "tests/fixtures/run-boq-multi-trade.xlsx";
    const rows = [["الرقم", "وصف البند", "الوحدة", "الكمية"], ["2/1", "جدار بلوك خرساني", "م2", "50"]];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    writeFileSync(boq3, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    let tagCalls = 0;
    let matchCalls = 0;
    const adapter = makeAdapter(async (req) => {
      if (req.prompt.includes("نماذج التسعير المتاحة")) {
        matchCalls++;
        // Decline on the first (tiling) catalog, accept on the second (blockwork) catalog.
        if (req.prompt.includes(`${tradeSlug}.ceramic_floor`)) return `{"costModelId":null,"confidence":0}`;
        return `{"costModelId":"${tradeSlug2}.block_wall","confidence":0.85}`;
      }
      tagCalls++;
      return '{"material":"block","category":"wall"}';
    });

    const out = await runPipeline({ file: boq3, profileSlug: profileSlug2, adapter });

    expect(tagCalls).toBe(1);       // tagged once, not once per candidate trade
    expect(matchCalls).toBe(2);     // matchLine still tried both trades

    const row = out.rows.find((r) => r.itemCode === "2/1")!;
    expect(row.flags).not.toContain("NO_MATCH");
    expect(row.rateJD).not.toBeNull();
  });

  it("surfaces ingestion warnings through the pipeline output instead of dropping them", async () => {
    // A sheet with no recognizable description column triggers ingestExcel's
    // "تعذّر تحديد عمود الوصف" warning. Previously runPipeline used only
    // extraction.lines and silently dropped extraction.warnings.
    const boq4 = "tests/fixtures/run-boq-no-desc-col.xlsx";
    const rows = [["foo", "bar", "baz"], ["x", "بلاط سيراميك أرضيات", "م2"]];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOQ");
    writeFileSync(boq4, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const adapter = makeAdapter(async () => '{"material":"ceramic"}');
    const out = await runPipeline({ file: boq4, profileSlug, adapter });

    expect(out.ingestionWarnings.length).toBeGreaterThan(0);
    expect(out.ingestionWarnings[0]).toContain("عمود الوصف");
    expect((out.json as { ingestionWarnings: string[] }).ingestionWarnings).toEqual(out.ingestionWarnings);
  });
});
