import Link from "next/link";
import { listQuotes } from "@/lib/db/quotes";
import { filsToJDString } from "@/lib/domain/money";
import { createClient } from "@/lib/supabase/server";

export default async function QuotesList() {
  const db = await createClient();
  const quotes = await listQuotes(db);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">عروض الأسعار</h1>
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right bg-gray-50 text-gray-600">
              <th className="p-3 font-medium">المشروع</th>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium">المجموع</th>
              <th className="p-3 font-medium">مُعلّم</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                <td className="p-3">
                  <Link href={`/quotes/${q.id}`} className="text-blue-700 hover:text-blue-800 font-medium">
                    {q.name ?? q.id}
                  </Link>
                </td>
                <td className="p-3 text-gray-600">{new Date(q.createdAt).toLocaleDateString("ar")}</td>
                <td className="p-3 text-gray-900 tabular-nums">{filsToJDString(q.grandTotalFils)} د.أ</td>
                <td className="p-3">
                  {q.flaggedCount > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                      {q.flaggedCount}
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">
                  لا توجد عروض بعد — شغّل الأنبوب محلياً.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
