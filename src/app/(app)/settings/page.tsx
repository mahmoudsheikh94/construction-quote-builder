import { getFirmSettings } from "@/lib/db/firm-settings";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const db = await createClient();
  const firm = await getFirmSettings(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">الإعدادات</h1>
        <p className="text-sm text-gray-500 mt-1">ثوابت الشركة التي تُطبَّق على كل التسعيرات.</p>
      </div>
      <SettingsForm initial={firm} />
    </div>
  );
}
