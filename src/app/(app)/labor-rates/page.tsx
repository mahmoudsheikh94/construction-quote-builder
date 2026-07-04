import { listLaborRates } from "./data";
import { LaborRateCard } from "./LaborRateCard";
import { AddLaborRateButton } from "./AddLaborRateButton";

export default async function LaborRatesPage() {
  const rates = await listLaborRates();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">أجور المهن اليومية</h1>
          <p className="mt-1 text-sm text-gray-500">
            سجّل أجرة اليوم لكل مهنة — وأضف الإنتاجية عند الحاجة.
          </p>
        </div>
        <AddLaborRateButton />
      </div>

      {rates.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
          لا توجد مهن بعد. اضغط «+ مهنة جديدة» للبدء.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rates.map((rate) => (
            <LaborRateCard key={rate.id} rate={rate} />
          ))}
        </div>
      )}
    </div>
  );
}
