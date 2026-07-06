import { describe, it, expect } from "vitest";
import { applyPricedFields, EXTRACT_SYSTEM_PRICED } from "@/lib/ingest/pdf";

// ingestPdf's orchestration is pdfjs-bound (like the existing pdf.test.ts, which
// only tests the pure helpers). The priced logic lives in the pure applyPricedFields,
// which we test directly.
describe("applyPricedFields", () => {
  it("parses verbatim rate/amount strings into fils", () => {
    const line = {
      sectionRef: "1",
      descriptionOriginal: "Excavation",
      unitRaw: "m3",
      quantityRaw: "100",
      rateRaw: "٥٫٥",
      amountRaw: "550",
    };
    const out = applyPricedFields(line, 0);
    expect(out.truthRateFils).toBe(5500);
    expect(out.truthAmountFils).toBe(550000);
    expect(out.sortOrder).toBe(0);
    // raw fields are stripped from the RawLine
    expect((out as { rateRaw?: string }).rateRaw).toBeUndefined();
  });

  it("null truth when a raw field is absent or unparseable", () => {
    const out = applyPricedFields({ sectionRef: "1", descriptionOriginal: "x", rateRaw: "N/A" }, 3);
    expect(out.truthRateFils).toBeNull();
    expect(out.truthAmountFils).toBeNull();
  });
});

describe("EXTRACT_SYSTEM_PRICED", () => {
  it("asks for verbatim prices and forbids arithmetic", () => {
    expect(EXTRACT_SYSTEM_PRICED).toContain("rateRaw");
    expect(EXTRACT_SYSTEM_PRICED).toContain("amountRaw");
    expect(EXTRACT_SYSTEM_PRICED).toContain("دون أي حساب");
  });
});
