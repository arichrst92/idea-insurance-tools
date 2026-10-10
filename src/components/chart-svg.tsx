/** Tempatkan SVG chart hasil render server (aman: dibuat oleh ECharts dari angka kita sendiri). */
export function ChartSvg({ svg, label }: { svg: string; label: string }) {
  return <div role="img" aria-label={label} className="w-full overflow-x-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:min-w-[520px] sm:[&_svg]:min-w-0" dangerouslySetInnerHTML={{ __html: svg }} />;
}
