export default function LayoutCetak({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html,body{background:#fff!important} @page{size:A4}`}</style>
      {children}
    </>
  );
}
