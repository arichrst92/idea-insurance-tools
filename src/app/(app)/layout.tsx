import { Dock } from "@/components/dock";
import { wajibLogin } from "@/lib/auth/session";
import { aksiLogout } from "@/app/login/actions";

export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  const { user } = await wajibLogin();
  const inisial = user.nama
    .split(/\s+/)
    .slice(0, 2)
    .map((k) => k[0])
    .join("")
    .toUpperCase();

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-36 pt-6 sm:px-8">
        <div className="flex justify-end">
          <form action={aksiLogout} className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-1">
            <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
              {inisial}
            </span>
            <span className="text-[13px] font-semibold">{user.nama}</span>
            <span className="text-[11px] uppercase tracking-wider text-ink-3">{user.role}</span>
            <button className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:bg-canvas hover:text-ink">
              Keluar
            </button>
          </form>
        </div>
        {children}
      </div>
      <Dock role={user.role} />
    </div>
  );
}
