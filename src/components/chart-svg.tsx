/** Tempatkan SVG chart hasil render server (aman: dibuat oleh ECharts dari angka kita sendiri). */
export function ChartSvg({ svg, label }: { svg: string; label: string }) {
  return <div role="img" aria-label={label} className="w-full overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
