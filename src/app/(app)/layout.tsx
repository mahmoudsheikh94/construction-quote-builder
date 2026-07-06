import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";
import { createClient } from "@/lib/supabase/server";

// These pages read per-request session cookies (RLS-enforced) — never prerender them at build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side auth gate (defense-in-depth; does not rely on middleware alone).
  // Unauthenticated → the anon role, which RLS denies — so redirect before any page queries.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-6 text-sm">
        <Link href="/" className="font-semibold text-gray-900">
          منشئ عروض الأسعار
        </Link>
        <Link href="/quotes" className="text-gray-600 hover:text-gray-900 transition-colors">
          عروض الأسعار
        </Link>
        <Link href="/trades" className="text-gray-600 hover:text-gray-900 transition-colors">
          المهن والأسعار
        </Link>
        <Link href="/labor-rates" className="text-gray-600 hover:text-gray-900 transition-colors">
          أجور المهن
        </Link>
        <Link href="/price-book" className="text-gray-600 hover:text-gray-900 transition-colors">
          دفتر الأسعار
        </Link>
        <Link href="/settings" className="text-gray-600 hover:text-gray-900 transition-colors">
          الإعدادات
        </Link>
        <form action={signOut} className="ms-auto">
          <button className="text-red-600 hover:text-red-700 transition-colors">خروج</button>
        </form>
      </nav>
      <main className="p-6 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
