import { describe, it, expect } from "vitest";
import { classifyItemType } from "@/lib/ingest/item-type-gate";

const line = (over: Partial<Parameters<typeof classifyItemType>[0]>) =>
  ({ sortOrder: 0, sectionRef: "x", descriptionOriginal: "", ...over } as any);

describe("classifyItemType", () => {
  it("detects provisional sums", () => {
    expect(classifyItemType(line({ descriptionOriginal: "مبلغ احتياطي لنقل الخدمات", unitRaw: "مقطوع" })).itemType).toBe("provisional_sum");
    expect(classifyItemType(line({ descriptionOriginal: "Provisional Sum for utility relocation" })).itemType).toBe("provisional_sum");
  });
  it("detects dayworks", () => {
    expect(classifyItemType(line({ descriptionOriginal: "أعمال باليومية", unitRaw: "يوم" })).itemType).toBe("dayworks");
    expect(classifyItemType(line({ descriptionOriginal: "Dayworks - skilled labour", unitRaw: "hr" })).itemType).toBe("dayworks");
  });
  it("detects percentage lines", () => {
    expect(classifyItemType(line({ descriptionOriginal: "Overhead and Profit", unitRaw: "%" })).itemType).toBe("percentage");
  });
  it("detects lump sum", () => {
    expect(classifyItemType(line({ descriptionOriginal: "تجهيز الموقع", unitRaw: "مقطوع" })).itemType).toBe("lump_sum");
  });
  it("defaults to unit_rate for ordinary measured items", () => {
    const r = classifyItemType(line({ descriptionOriginal: "خرسانة عادية درجة 18", unitRaw: "م3" }));
    expect(r.itemType).toBe("unit_rate");
    expect(r.confident).toBe(true);
  });
});
