import { Dock } from "@/components/dock";
import { wajibLogin } from "@/lib/auth/session";

export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  const { user } = await wajibLogin();

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-36 pt-6 sm:px-8">{children}</div>
      <Dock role={user.role} nama={user.nama} />
    </div>
  );
}
