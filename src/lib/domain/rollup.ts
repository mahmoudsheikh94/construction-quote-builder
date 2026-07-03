export interface RollupInput { sectionRef: string; amountFils: number | null }

export interface QuoteRollup {
  sections: Array<{ sectionRef: string; totalFils: number; itemCount: number; unpricedCount: number }>;
  grandTotalFils: number;
}

export interface RollupFlag {
  code: "ROLLUP_MISMATCH";
  severity: "error";
  messageAr: string;
  detail: unknown;
}

export function buildRollup(lines: RollupInput[]): QuoteRollup {
  const order: string[] = [];
  const bySection = new Map<string, { totalFils: number; itemCount: number; unpricedCount: number }>();
  for (const line of lines) {
    if (!bySection.has(line.sectionRef)) {
      bySection.set(line.sectionRef, { totalFils: 0, itemCount: 0, unpricedCount: 0 });
      order.push(line.sectionRef);
    }
    const s = bySection.get(line.sectionRef)!;
    s.itemCount += 1;
    if (line.amountFils === null) s.unpricedCount += 1;
    else s.totalFils += line.amountFils;
  }
  const sections = order.map((sectionRef) => ({ sectionRef, ...bySection.get(sectionRef)! }));
  return { sections, grandTotalFils: sections.reduce((a, s) => a + s.totalFils, 0) };
}

export function verifyRollup(
  computed: QuoteRollup,
  reported: { sectionTotals?: Record<string, number>; grandTotalFils?: number },
): RollupFlag[] {
  const flags: RollupFlag[] = [];
  for (const [sectionRef, reportedTotal] of Object.entries(reported.sectionTotals ?? {})) {
    const section = computed.sections.find((s) => s.sectionRef === sectionRef);
    const computedTotal = section?.totalFils ?? 0;
    if (computedTotal !== reportedTotal) {
      flags.push({
        code: "ROLLUP_MISMATCH", severity: "error",
        messageAr: `مجموع القسم ${sectionRef} لا يتطابق مع المجموع المرحّل`,
        detail: { sectionRef, computed: computedTotal, reported: reportedTotal },
      });
    }
  }
  if (reported.grandTotalFils !== undefined && reported.grandTotalFils !== computed.grandTotalFils) {
    flags.push({
      code: "ROLLUP_MISMATCH", severity: "error",
      messageAr: "المجموع الكلي لا يتطابق مع الخلاصة",
      detail: { computed: computed.grandTotalFils, reported: reported.grandTotalFils },
    });
  }
  return flags;
}
