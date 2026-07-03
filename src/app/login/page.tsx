"use client";
import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={async (fd) => { const r = await signIn(fd); if (r?.error) setError(r.error); }}
        className="w-full max-w-sm space-y-4 border rounded-xl p-6"
      >
        <h1 className="text-xl font-medium">تسجيل الدخول</h1>
        <input name="email" type="email" required placeholder="البريد الإلكتروني" className="w-full border rounded p-2" />
        <input name="password" type="password" required placeholder="كلمة المرور" className="w-full border rounded p-2" />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full border rounded p-2 bg-black text-white">دخول</button>
      </form>
    </main>
  );
}
