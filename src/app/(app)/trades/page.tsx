import Link from "next/link";
import { listSkills } from "@/lib/db/skills";
import { createClient } from "@/lib/supabase/server";
import { AddTradeButton } from "./AddTradeButton";

export default async function TradesList() {
  const db = await createClient();
  const skills = await listSkills(db);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">المهن والأسعار</h1>
          <p className="text-sm text-gray-500 mt-1">نماذج التسعير لكل مهنة — كل حفظ ينشئ نسخة جديدة يمكن الرجوع إليها.</p>
        </div>
        <AddTradeButton />
      </div>
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {skills.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/trades/${s.slug}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <span className="text-gray-900 font-medium">{s.nameAr}</span>
                <span className="flex items-center gap-3 text-xs">
                  {!s.hasActive && (
                    <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">بلا نسخة مفعّلة</span>
                  )}
                  <span className="text-blue-700 font-medium">فتح ←</span>
                </span>
              </Link>
            </li>
          ))}
          {skills.length === 0 && (
            <li className="p-6 text-center text-gray-500">لا توجد مهن بعد.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
