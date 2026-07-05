import { describe, it, expect } from "vitest";
import { parseJDNumberToFils, parsePriceToFils } from "@/lib/ingest/price-parse";

describe("parseJDNumberToFils", () => {
  it("converts JS numbers to fils, absorbing IEEE artifacts", () => {
    expect(parseJDNumberToFils(9)).toBe(9000);
    expect(parseJDNumberToFils(8.5)).toBe(8500);
    expect(parseJDNumberToFils(1.1000000000000001)).toBe(1100);
    expect(parseJDNumberToFils(672.4000000000001)).toBe(672400);
  });
});

describe("parsePriceToFils", () => {
  it("parses plain Latin-digit strings", () => {
    expect(parsePriceToFils("9")).toBe(9000);
    expect(parsePriceToFils("8.5")).toBe(8500);
  });
  it("parses Arabic-Indic digits", () => {
    expect(parsePriceToFils("٨٫٥")).toBe(8500); // ٫ decimal
    expect(parsePriceToFils("١٢٣")).toBe(123000);
  });
  it("strips currency tokens and thousands separators", () => {
    expect(parsePriceToFils("1,250 JD")).toBe(1250000);
    expect(parsePriceToFils("د.ا ٩٥")).toBe(95000);
  });
  it("returns null on unparseable input", () => {
    expect(parsePriceToFils("")).toBeNull();
    expect(parsePriceToFils("N/A")).toBeNull();
    expect(parsePriceToFils("-")).toBeNull();
  });
});
