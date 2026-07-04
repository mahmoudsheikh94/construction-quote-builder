import Link from "next/link";
import { getActiveSkill, listSkillVersions } from "@/lib/db/skills";
import { createClient } from "@/lib/supabase/server";
import { TradeEditor } from "./TradeEditor";
import { VersionHistory } from "./VersionHistory";

export default async function TradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await createClient();
  const active = await getActiveSkill(slug, db);
  const { data: skill } = await db
    .from("trade_skills").select("id, name_ar").eq("slug", slug).maybeSingle();
  const versions = skill ? await listSkillVersions(skill.id, db) : [];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/trades" className="text-sm text-blue-700 hover:text-blue-800">← المهن</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-1">{skill?.name_ar ?? slug}</h1>
        <p className="text-sm text-gray-500 mt-1 font-mono">{slug}</p>
      </div>

      <TradeEditor
        slug={slug}
        nameAr={skill?.name_ar ?? slug}
        content={active?.content ?? { trade: slug, costModels: [] }}
      />

      <VersionHistory
        slug={slug}
        versions={versions}
        activeVersionNumber={active?.versionNumber ?? null}
      />
    </div>
  );
}
