import { describe, it, expect } from "vitest";
import { arabicIndicToLatin, parseQuantityToThousandths, normalizeUnit } from "@/lib/domain/normalize";

describe("arabicIndicToLatin", () => {
  it("converts Arabic-Indic digits and separators", () => {
    expect(arabicIndicToLatin("١٨٠٠٠")).toBe("18000");
    expect(arabicIndicToLatin("١٬٢٠٠٫٥")).toBe("1200.5");
    expect(arabicIndicToLatin("abc 123")).toBe("abc 123");
  });
});

describe("parseQuantityToThousandths", () => {
  it("parses Latin and Arabic-Indic quantities", () => {
    expect(parseQuantityToThousandths("18000")).toBe(18_000_000);
    expect(parseQuantityToThousandths("١٢٠٠")).toBe(1_200_000);
    expect(parseQuantityToThousandths("1,200.5")).toBe(1_200_500);
    expect(parseQuantityToThousandths("٦١")).toBe(61_000);
  });
  it("rejects >3dp and junk", () => {
    expect(() => parseQuantityToThousandths("1.0005")).toThrow();
    expect(() => parseQuantityToThousandths("")).toThrow();
  });
});

describe("normalizeUnit", () => {
  it("maps Arabic and English variants to canonical units", () => {
    expect(normalizeUnit("م٣")).toBe("m3");
    expect(normalizeUnit("م3")).toBe("m3");
    expect(normalizeUnit("M2")).toBe("m2");
    expect(normalizeUnit("م²")).toBe("m2");
    expect(normalizeUnit("م.ط")).toBe("lm");
    expect(normalizeUnit("LM")).toBe("lm");
    expect(normalizeUnit("m")).toBe("lm");
    expect(normalizeUnit("طن")).toBe("ton");
    expect(normalizeUnit("عدد")).toBe("nr");
    expect(normalizeUnit("No.")).toBe("nr");
    expect(normalizeUnit("مقطوع")).toBe("ls");
    expect(normalizeUnit("L.S")).toBe("ls");
    expect(normalizeUnit("يوم")).toBe("day");
    expect(normalizeUnit("ليلة")).toBe("night");
    expect(normalizeUnit("حبة")).toBe("pc");
  });
  it("returns null for unknown units", () => {
    expect(normalizeUnit("bananas")).toBeNull();
    expect(normalizeUnit("")).toBeNull();
  });
});
