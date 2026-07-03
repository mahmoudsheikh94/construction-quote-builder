"use client";
import { useState } from "react";
import { rollback } from "./actions";

interface Version {
  id: string;
  versionNumber: number;
  changelog: string | null;
  createdAt: string;
}

export function VersionHistory({
  slug,
  versions,
  activeVersionNumber,
}: {
  slug: string;
  versions: Version[];
  activeVersionNumber: number | null;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleRollback(versionId: string) {
    setPendingId(versionId);
    setErr(null);
    try {
      await rollback(slug, versionId);
    } catch {
      setErr("تعذّر تفعيل هذه النسخة.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-gray-900">سجل النسخ</h2>
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {versions.map((v) => {
            const isActive = v.versionNumber === activeVersionNumber;
            return (
              <li key={v.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-gray-900">نسخة {v.versionNumber}</span>
                  {isActive && (
                    <span className="ms-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      الحالية
                    </span>
                  )}
                  <p className="text-gray-500 truncate">{v.changelog || "بلا وصف"}</p>
                  <p className="text-gray-400 text-xs">{new Date(v.createdAt).toLocaleString("ar")}</p>
                </div>
                {!isActive && (
                  <button
                    onClick={() => handleRollback(v.id)}
                    disabled={pendingId === v.id}
                    className="shrink-0 text-blue-700 hover:text-blue-800 font-medium disabled:opacity-50"
                  >
                    {pendingId === v.id ? "..." : "تفعيل"}
                  </button>
                )}
              </li>
            );
          })}
          {versions.length === 0 && (
            <li className="p-6 text-center text-gray-500">لا يوجد سجل نسخ بعد — احفظ أول نسخة أعلاه.</li>
          )}
        </ul>
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </section>
  );
}
