"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { money } from "@/lib/format";
export function ExpenseChart({
  data,
  currency,
}: {
  data: { category: string; cents: number }[];
  currency: string;
}) {
  if (!data.length) return <p className="muted">Voeg uitgaven toe om de verdeling te zien.</p>;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} accessibilityLayer>
          <XAxis dataKey="category" tick={{ fontSize: 14 }} />
          <YAxis tickFormatter={(v) => String(Number(v) / 100)} width={60} />
          <Tooltip formatter={(v) => money(Number(v), currency)} />
          <Bar dataKey="cents" name="Uitgaven" fill="#1f2937" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
