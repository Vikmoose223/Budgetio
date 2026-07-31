"use client";

import { Area, AreaChart, CartesianGrid, XAxis, ReferenceLine } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatILS } from "@/lib/format";

const config: ChartConfig = {
  net: { label: "הון עצמי", color: "var(--chart-2)" },
};

export type TrendPoint = { label: string; net: number };

export function NetWorthTrend({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
        צריך לפחות חודשיים של נתונים כדי להציג מגמה
      </div>
    );
  }

  // Net worth can legitimately be negative, so the zero line is meaningful here
  // in a way it never is on the spending chart.
  const hasNegative = data.some((d) => d.net < 0);

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
        {hasNegative && <ReferenceLine y={0} stroke="var(--border)" />}
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
          dataKey="net"
          type="natural"
          fill="var(--chart-2)"
          fillOpacity={0.18}
          stroke="var(--chart-2)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
