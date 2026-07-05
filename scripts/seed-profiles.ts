import "./_env";
import {
  createProfile, createProfileVersion, activateProfileVersion, getActiveProfile,
} from "../src/lib/db/skills";

// Seed + activate the project-type profiles the golden cases price against.
// Idempotent: skips a profile that is already active. The trade-skill slugs listed
// must exist as trade_skills with active versions (Phase-2 seeding); a missing slug
// simply won't match during a run — acceptable for the harness.
const PROFILES: Record<string, string[]> = {
  civil: ["concrete", "blockwork", "plastering", "tiling", "excavation"],
  mep: ["plumbing", "electrical", "hvac"],
  architectural: ["tiling", "painting", "doors-windows", "false-ceiling"],
};

for (const [slug, trades] of Object.entries(PROFILES)) {
  const existing = await getActiveProfile(slug);
  if (existing) {
    console.log(`${slug}: already active, skip`);
    continue;
  }
  const { id } = await createProfile(slug, slug);
  const { id: versionId } = await createProfileVersion(id, { trades, ratioChecks: [] }, "seed");
  await activateProfileVersion(id, versionId);
  console.log(`${slug}: seeded + activated with trades ${trades.join(", ")}`);
}
