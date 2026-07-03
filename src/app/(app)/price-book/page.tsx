import { getSnapshot } from "@/lib/db/price-book";
import { PriceBookTable } from "./PriceBookTable";

export default async function PriceBookPage() {
  const snap = await getSnapshot();
  const rows = Object.entries(snap)
    .map(([key, e]) => ({ key, unit: e.unit, priceFils: e.priceFils }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">دفتر الأسعار</h1>
      <PriceBookTable rows={rows} />
    </div>
  );
}
