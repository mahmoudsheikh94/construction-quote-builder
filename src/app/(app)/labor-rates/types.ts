export type LaborRateProductivity = {
  id: string;
  labor_rate_id: string;
  label: string;
  output_per_day: number;
  unit: string;
};

export type LaborRate = {
  id: string;
  name: string;
  day_rate: number;
  currency: string;
  created_at: string;
  labor_rate_productivity: LaborRateProductivity[];
};

export type ProductivityInput = {
  label: string;
  output_per_day: number;
  unit: string;
};

export type LaborRateInput = {
  name: string;
  day_rate: number;
  currency: string;
  productivity: ProductivityInput[];
};
