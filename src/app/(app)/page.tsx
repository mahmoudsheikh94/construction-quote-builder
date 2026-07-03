import Link from "next/link";
import { listQuotes } from "@/lib/db/quotes";
import { listSkills } from "@/lib/db/skills";
import { filsToJDString } from "@/lib/domain/money";

export default async function Dashboard() {
  const [quotes, skills] = await Promise.all([listQuotes(), listSkills()]);
  const recent = quotes.slice(0, 5);
  const flaggedTotal = quotes.reduce((a, q) => a + q.flaggedCount, 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="عروض الأسعار" value={quotes.length} />
        <Stat label="المهن" value={skills.length} />
        <Stat label="بحاجة لمراجعة" value={flaggedTotal} accent={flaggedTotal > 0} />
      </div>

      <section>
        <h2 className="text-lg font-medium text-gray-900 mb-3">أحدث العروض</h2>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-xl bg-white overflow-hidden">
          {recent.map((q) => (
            <li key={q.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <Link href={`/quotes/${q.id}`} className="text-blue-700 hover:text-blue-800 font-medium">
                {q.name ?? q.id}
              </Link>
              <span className="text-sm text-gray-600">
                {filsToJDString(q.grandTotalFils)} د.أ
                <span className="mx-2 text-gray-300">·</span>
                {q.flaggedCount} مُعلّم
              </span>
            </li>
          ))}
          {recent.length === 0 && (
            <li className="p-6 text-center text-gray-500">
              لا توجد عروض بعد — شغّل الأنبوب محلياً.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${accent ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}
