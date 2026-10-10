import "server-only";
import * as echarts from "echarts";

// Chart dirender di server sebagai SVG (ECharts SSR) — tampil sama di layar dan di PDF.

export type Seri = { nama: string; data: number[]; warna: string };

const singkat = (n: number) =>
  n >= 1e9 ? `${+(n / 1e9).toFixed(1)} M` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)} jt` : n >= 1e3 ? `${+(n / 1e3).toFixed(0)} rb` : String(n);

/** Bar chart vertikal; beberapa seri ditampilkan berdampingan. */
export function svgBar(p: { kategori: string[]; seri: Seri[]; lebar?: number; tinggi?: number; label?: boolean }): string {
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: p.lebar ?? 720, height: p.tinggi ?? 260 });
  chart.setOption({
    animation: false,
    textStyle: { fontFamily: "Inter, Arial, sans-serif", color: "#4B5563" },
    grid: { left: 52, right: 12, top: p.seri.length > 1 ? 34 : 16, bottom: 28 },
    legend: p.seri.length > 1 ? { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 13 } } : undefined,
    xAxis: { type: "category", data: p.kategori, axisTick: { show: false }, axisLine: { lineStyle: { color: "#E3E6EF" } }, axisLabel: { fontSize: 13 } },
    yAxis: { type: "value", splitLine: { lineStyle: { color: "#EEF0F5" } }, axisLabel: { fontSize: 12, formatter: singkat } },
    series: p.seri.map((s) => ({
      name: s.nama,
      type: "bar",
      data: s.data,
      barMaxWidth: 28,
      itemStyle: { color: s.warna, borderRadius: [4, 4, 0, 0] },
      label: p.label ? { show: true, position: "top", fontSize: 12, formatter: ({ value }: { value: number }) => (value ? singkat(value) : "") } : undefined,
    })),
  });
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

export const WARNA = { brand: "#2B59F0", ok: "#157A43", bad: "#B42318", warn: "#B45309" };
