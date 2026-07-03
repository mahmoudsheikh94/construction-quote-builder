import { describe, it, expect } from "vitest";
import { createProject, createQuote, insertLineItems, getQuoteItems } from "@/lib/db/quotes";

describe("quotes repository", () => {
  it("creates project → quote → line items and reads them back ordered", async () => {
    const project = await createProject({ name: "مشروع تجريبي", projectType: "residential" });
    const quote = await createQuote(project.id);

    await insertLineItems(quote.id, [
      { sortOrder: 2, sectionRef: "2", descriptionOriginal: "خرسانة عادية", unitRaw: "م٣", unitCanonical: "m3", quantityThousandths: 93_000 },
      { sortOrder: 1, sectionRef: "1", descriptionOriginal: "حفريات", unitRaw: "م٣", unitCanonical: "m3", quantityThousandths: 18_000_000 },
    ]);

    const items = await getQuoteItems(quote.id);
    expect(items).toHaveLength(2);
    expect(items[0].description_original).toBe("حفريات");
    expect(items[1].quantity_thousandths).toBe(93_000);
    expect(items[0].item_type).toBe("unit_rate");
  });
});
