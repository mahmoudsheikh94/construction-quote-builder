import { describe, it, expect } from "vitest";
import { arabicCardinalToInt } from "@/lib/ingest/arabic-words";

describe("arabicCardinalToInt", () => {
  it("parses units, teens, tens", () => {
    expect(arabicCardinalToInt("ثلاثة")).toBe(3);
    expect(arabicCardinalToInt("ثمانية عشر")).toBe(18);
    expect(arabicCardinalToInt("واحد وستون")).toBe(61);   // 61 (one and sixty)
    expect(arabicCardinalToInt("ثلاثة وتسعون")).toBe(93);
  });
  it("parses hundreds and thousands", () => {
    expect(arabicCardinalToInt("ألفان وسبعمائة")).toBe(2700);
    expect(arabicCardinalToInt("ثمانية عشر ألف")).toBe(18000);
    expect(arabicCardinalToInt("ألف ومئتان")).toBe(1200);
  });
  it("returns null for unparseable input", () => {
    expect(arabicCardinalToInt("")).toBeNull();
    expect(arabicCardinalToInt("سيارة زرقاء")).toBeNull();
  });
});
