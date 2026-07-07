"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatILS } from "@/lib/format";

const config: ChartConfig = {
  total: { label: "הוצאות", color: "var(--chart-1)" },
};

export function TrendChart({
  data,
}: {
  data: { label: string; total: number }[];
}) {
  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v: string) => v.split(" ")[0]}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {formatILS(Number(value))}
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="total"
          type="natural"
          fill="var(--chart-1)"
          fillOpacity={0.18}
          stroke="var(--chart-1)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
