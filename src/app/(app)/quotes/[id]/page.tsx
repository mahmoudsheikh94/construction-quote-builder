import { getQuote } from "@/lib/db/quotes";
import { QuoteTable } from "./QuoteTable";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getQuote(id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">{quote.name ?? id}</h1>
      <QuoteTable quoteId={id} lines={quote.lines} />
    </div>
  );
}
