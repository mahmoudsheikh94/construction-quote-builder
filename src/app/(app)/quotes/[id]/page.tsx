import { getQuote } from "@/lib/db/quotes";
import { QuoteTable } from "./QuoteTable";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote(id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{quote.name ?? id}</h1>
        <a href={`/quotes/${id}/export`} className="text-blue-700 text-sm">تصدير Excel</a>
      </div>
      <QuoteTable quoteId={id} lines={quote.lines} />
    </div>
  );
}
