import { serviceClient } from "./client";
import {
  SkillContentSchema, ProfileContentSchema,
  type SkillContent, type ProfileContent,
} from "@/lib/domain/skill-schema";

export async function listSkills() {
  const { data, error } = await serviceClient()
    .from("trade_skills").select("slug, name_ar, active_version_id").order("name_ar");
  if (error) throw error;
  return data.map((s) => ({ slug: s.slug, nameAr: s.name_ar, hasActive: !!s.active_version_id }));
}

export async function createSkill(slug: string, nameAr: string) {
  const { data, error } = await serviceClient()
    .from("trade_skills").insert({ slug, name_ar: nameAr }).select("id").single();
  if (error) throw error;
  return data;
}

export async function createSkillVersion(skillId: string, content: SkillContent, changelog: string) {
  const parsed = SkillContentSchema.parse(content);
  const { data: latest, error: qErr } = await serviceClient()
    .from("skill_versions").select("version_number, id")
    .eq("skill_id", skillId).order("version_number", { ascending: false }).limit(1);
  if (qErr) throw qErr;
  const versionNumber = (latest?.[0]?.version_number ?? 0) + 1;
  const { data, error } = await serviceClient()
    .from("skill_versions")
    .insert({
      skill_id: skillId, version_number: versionNumber, content: parsed,
      changelog, parent_version_id: latest?.[0]?.id ?? null,
    })
    .select("id").single();
  if (error) throw error;
  return { id: data.id, versionNumber };
}

export async function activateSkillVersion(skillId: string, versionId: string) {
  const { error } = await serviceClient()
    .from("trade_skills").update({ active_version_id: versionId }).eq("id", skillId);
  if (error) throw error;
}

export async function getActiveSkill(slug: string) {
  const { data, error } = await serviceClient()
    .from("trade_skills").select("active_version_id").eq("slug", slug).single();
  if (error) throw error;
  if (!data.active_version_id) return null;
  const { data: v, error: vErr } = await serviceClient()
    .from("skill_versions").select("id, version_number, content")
    .eq("id", data.active_version_id).single();
  if (vErr) throw vErr;
  return {
    content: SkillContentSchema.parse(v.content),
    versionId: v.id,
    versionNumber: v.version_number,
  };
}

export async function listSkillVersions(skillId: string) {
  const { data, error } = await serviceClient()
    .from("skill_versions").select("id, version_number, changelog, created_at")
    .eq("skill_id", skillId).order("version_number", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, versionNumber: r.version_number,
    changelog: r.changelog, createdAt: r.created_at,
  }));
}

// Profiles: same pattern.
export async function createProfile(slug: string, nameAr: string) {
  const { data, error } = await serviceClient()
    .from("project_type_profiles").insert({ slug, name_ar: nameAr }).select("id").single();
  if (error) throw error;
  return data;
}

export async function createProfileVersion(profileId: string, content: ProfileContent, changelog: string) {
  const parsed = ProfileContentSchema.parse(content);
  const { data: latest, error: qErr } = await serviceClient()
    .from("profile_versions").select("version_number")
    .eq("profile_id", profileId).order("version_number", { ascending: false }).limit(1);
  if (qErr) throw qErr;
  const versionNumber = (latest?.[0]?.version_number ?? 0) + 1;
  const { data, error } = await serviceClient()
    .from("profile_versions")
    .insert({ profile_id: profileId, version_number: versionNumber, content: parsed, changelog })
    .select("id").single();
  if (error) throw error;
  return { id: data.id, versionNumber };
}

export async function activateProfileVersion(profileId: string, versionId: string) {
  const { error } = await serviceClient()
    .from("project_type_profiles").update({ active_version_id: versionId }).eq("id", profileId);
  if (error) throw error;
}

export async function getActiveProfile(slug: string) {
  const { data, error } = await serviceClient()
    .from("project_type_profiles").select("active_version_id").eq("slug", slug).single();
  if (error) throw error;
  if (!data.active_version_id) return null;
  const { data: v, error: vErr } = await serviceClient()
    .from("profile_versions").select("id, version_number, content")
    .eq("id", data.active_version_id).single();
  if (vErr) throw vErr;
  return {
    content: ProfileContentSchema.parse(v.content),
    versionId: v.id,
    versionNumber: v.version_number,
  };
}
