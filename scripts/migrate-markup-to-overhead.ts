import "./_env";
import { listSkills, getActiveSkill, createSkillVersion, activateSkillVersion } from "../src/lib/db/skills";
import { serviceClient } from "../src/lib/db/client";

async function skillIdBySlug(slug: string): Promise<string | null> {
  const { data } = await serviceClient().from("trade_skills").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

// Migrate every active skill's cost models from a blended markupPct to the
// overhead/profit split: overheadPct = markupPct, profitPct = "0". Because the
// compounding with profit=0 equals the legacy single markup, every quote reprices
// IDENTICALLY — this just moves models onto the split path. Idempotent: skips a model
// that already has overheadPct. --dry-run prints without writing.
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skills = await listSkills();
  let changed = 0;

  for (const s of skills) {
    if (!s.hasActive) continue;
    const active = await getActiveSkill(s.slug).catch(() => null);
    if (!active) continue;

    let touched = false;
    const content = {
      ...active.content,
      costModels: active.content.costModels.map((m) => {
        if (m.overheadPct != null) return m; // already split
        touched = true;
        return { ...m, overheadPct: m.markupPct, profitPct: "0" };
      }),
    };
    if (!touched) { console.log(`${s.slug}: already split, skip`); continue; }

    if (dryRun) {
      console.log(`${s.slug}: would split ${content.costModels.length} model(s)`);
    } else {
      const skillId = await skillIdBySlug(s.slug);
      if (!skillId) { console.log(`${s.slug}: no skill id, skip`); continue; }
      const { id: versionId } = await createSkillVersion(skillId, content, "split markup -> overhead/profit");
      await activateSkillVersion(skillId, versionId);
      console.log(`${s.slug}: split + activated`);
    }
    changed++;
  }
  console.log(`${dryRun ? "[dry-run] " : ""}${changed} skill(s) ${dryRun ? "would be" : ""} migrated`);
}

main().catch((e) => { console.error(e); process.exit(1); });
