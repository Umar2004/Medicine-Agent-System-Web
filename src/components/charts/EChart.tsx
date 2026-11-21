"use client";

import type { EChartsOption } from "echarts";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";


// ECharts touches `window`; load it client-side only.
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * Categorical slots, teal (brand family) then blue, each validated by the dataviz validator
 * against its own surface: light #FFFFFF, dark #13151C. Same slots as --series-1/2 in globals.css.
 * Reference lines are neutral and dashed — never a categorical hue.
 */
const CHART_THEMES = {
  light: {
    series: ["#0D9488", "#2a78d6"],
    reference: "#94A3B8",
    text: "#64748B",
    grid: "#E2E8F0",
    surface: "#FFFFFF",
    tooltipBg: "#FFFFFF",
    tooltipText: "#0F172A",
    tooltipBorder: "#E2E8F0",
  },
  dark: {
    series: ["#1BA898", "#4A8AE6"],
    reference: "#555870",
    text: "#8B8FA3",
    grid: "#1E2130",
    surface: "#13151C",
    tooltipBg: "#1A1C25",
    tooltipText: "#E8EAF0",
    tooltipBorder: "#1E2130",
  },
} as const;

export type ValueKind = "text" | "number" | "usd" | "lkr" | "date";

export interface ChartSeries {
  name: string;
  kind: ValueKind;
  data: number[];
  reference?: boolean;
}

export function formatValue(value: number, kind: ValueKind, compact = false): string {
  const opts: Intl.NumberFormatOptions = compact ? { notation: "compact", maximumFractionDigits: 1 } : {};
  if (kind === "usd") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...(compact ? opts : {}) }).format(value);
  if (kind === "lkr") return `${new Intl.NumberFormat("en-US", compact ? opts : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} LKR`;
  return new Intl.NumberFormat("en-US", opts).format(value);
}

/** Bar or line chart with one value axis, crosshair/hover tooltip, recessive grid. */
export function EChart({
  kind,
  categories,
  series,
  className = "h-72",
  ariaLabel,
}: {
  kind: "bar" | "line";
  categories: string[];
  series: ChartSeries[];
  /** Tailwind height class for the plot area. */
  className?: string;
  ariaLabel: string;
}) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const option = useMemo<EChartsOption>(() => {
    const c = CHART_THEMES[theme];
    const valueKind = series.find((s) => !s.reference)?.kind ?? "number";
    let colorIndex = 0;
    const showLegend = series.length >= 2;
    return {
      animationDuration: 300,
      textStyle: { fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", color: c.text },
      grid: { left: 8, right: 16, top: showLegend ? 36 : 16, bottom: 8, containLabel: true },
      legend: showLegend ? { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: c.text } } : undefined,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: kind === "line" ? "line" : "shadow", lineStyle: { color: c.reference } },
        valueFormatter: (v) => formatValue(Number(v), valueKind),
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.tooltipText },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { lineStyle: { color: c.grid } },
        axisTick: { show: false },
        axisLabel: { color: c.text, hideOverlap: true, width: 96, overflow: "truncate" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: c.grid, type: "dashed" } },
        axisLabel: { color: c.text, formatter: (v: number) => formatValue(v, valueKind, true) },
      },
      series: series.map((s) => {
        if (s.reference) {
          return {
            name: s.name,
            type: "line" as const,
            data: s.data,
            symbol: "none",
            step: kind === "bar" ? ("middle" as const) : undefined,
            lineStyle: { color: c.reference, width: 2, type: "dashed" as const },
            itemStyle: { color: c.reference },
            z: 3,
          };
        }
        const color = c.series[colorIndex++ % c.series.length];
        return kind === "bar"
          ? {
              name: s.name,
              type: "bar" as const,
              data: s.data,
              barMaxWidth: 28,
              itemStyle: { color, borderRadius: [4, 4, 0, 0] },
              // A zero bar is invisible — label it so "nothing" reads as a value, not missing data.
              label: {
                show: true,
                position: "top" as const,
                color: c.text,
                formatter: (p: { value: unknown }) => (Number(p.value) === 0 ? "0" : ""),
              },
              emphasis: { focus: "series" as const },
            }
          : {
              name: s.name,
              type: "line" as const,
              data: s.data,
              smooth: false,
              symbol: "circle",
              symbolSize: 8,
              showSymbol: s.data.length <= 31,
              lineStyle: { color, width: 2 },
              itemStyle: { color, borderColor: c.surface, borderWidth: 2 },
              areaStyle: { color, opacity: 0.08 },
            };
      }),
    };
  }, [kind, categories, series, theme]);

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge lazyUpdate />
    </div>
  );
}
