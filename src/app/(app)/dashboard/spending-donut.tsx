"use client";

import { Pie, PieChart, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatILS } from "@/lib/format";
import { PieChart as PieIcon } from "lucide-react";

export type DonutSlice = { name: string; value: number; color: string };

export function SpendingDonut({ data }: { data: DonutSlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <PieIcon className="size-8" />
        <p className="text-sm">אין הוצאות מסווגות בחודש זה</p>
      </div>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: `var(--${d.color})` }]),
  );

  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[220px]">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-medium tabular-nums">
                    {formatILS(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          strokeWidth={2}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={`var(--${d.color})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
