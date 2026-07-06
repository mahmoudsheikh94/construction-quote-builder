import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/, "قيمة عشرية غير صالحة");
const canonicalUnit = z.enum(["m3","m2","lm","ton","nr","ls","day","night","pc","hr","kg","pct"]);

export const CostComponentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["material", "labor", "equipment"]),
  labelAr: z.string().min(1),
  priceBookKey: z.string().min(1),
  qtyPerUnit: decimalString.optional(),
  productivityPerDay: decimalString.optional(),
  materialCategory: z.string().optional(),   // B3: join key into material_waste_defaults
}).refine(
  (c) => (c.kind === "labor" ? !!c.productivityPerDay : !!c.qtyPerUnit),
  { message: "labor يتطلب productivityPerDay، وغيره يتطلب qtyPerUnit" },
);

export const CostModelSchema = z.object({
  id: z.string().min(1),
  labelAr: z.string().min(1),
  unit: canonicalUnit,
  keywords: z.array(z.string()),
  components: z.array(CostComponentSchema).min(1),
  wastePct: decimalString,
  markupPct: decimalString,          // legacy blended markup (still honoured)
  overheadPct: decimalString.optional(),  // B2: overhead/profit split (compounding)
  profitPct: decimalString.optional(),
  band: z.object({ minRateFils: z.number().int().nonnegative(), maxRateFils: z.number().int().positive() }).optional(),
});

export const SkillContentSchema = z.object({
  trade: z.string().min(1),
  costModels: z.array(CostModelSchema),
});

export const ProfileContentSchema = z.object({
  trades: z.array(z.string().min(1)),
  ratioChecks: z.array(z.object({
    sectionMatch: z.string().min(1),
    minPct: z.number().min(0).max(100),
    maxPct: z.number().min(0).max(100),
    labelAr: z.string().min(1),
  })),
});

export type CostComponent = z.infer<typeof CostComponentSchema>;
export type CostModel = z.infer<typeof CostModelSchema>;
export type SkillContent = z.infer<typeof SkillContentSchema>;
export type ProfileContent = z.infer<typeof ProfileContentSchema>;
