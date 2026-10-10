"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutGrid,
  Send,
  Users,
  FileText,
  RefreshCw,
  CarFront,
  BarChart3,
  Wallet,
  Trophy,
  BookOpen,
  Landmark,
  CalendarDays,
  Zap,
  MessageCircle,
  Database,
  UserCog,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; ikon: LucideIcon; admin?: boolean; badge?: number };

// Menu yang belum dibangun tetap tampil agar dock konsisten dengan mockup;
// halamannya menampilkan "segera hadir" sampai sprint terkait selesai.
const ITEMS: Item[] = [
  { href: "/", label: "Dashboard", ikon: LayoutGrid },
  { href: "/pengajuan", label: "Pengajuan", ikon: Send },
  { href: "/nasabah", label: "Nasabah", ikon: Users },
  { href: "/polis", label: "Polis", ikon: FileText },
  { href: "/perpanjangan", label: "Perpanjangan", ikon: RefreshCw },
  { href: "/klaim", label: "Klaim", ikon: CarFront },
  { href: "/laporan", label: "Laporan", ikon: BarChart3 },
  { href: "/pencairan", label: "Pencairan", ikon: Wallet },
  { href: "/performa", label: "Performa", ikon: Trophy },
  { href: "/event", label: "Event", ikon: Sparkles },
  { href: "/panduan", label: "Panduan", ikon: BookOpen },
  { href: "/keuangan", label: "Keuangan", ikon: Landmark, admin: true },
  { href: "/jadwal-bayar", label: "Jadwal bayar", ikon: CalendarDays, admin: true },
  { href: "/otomasi", label: "Otomasi", ikon: Zap, admin: true },
  { href: "/whatsapp", label: "WhatsApp", ikon: MessageCircle, admin: true },
  { href: "/master", label: "Master data", ikon: Database, admin: true },
  { href: "/sales", label: "Sales", ikon: UserCog, admin: true },
];

export function Dock({ role }: { role: "admin" | "sales" }) {
  const path = usePathname();
  const aktif = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const umum = ITEMS.filter((i) => !i.admin);
  const admin = role === "admin" ? ITEMS.filter((i) => i.admin) : [];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
      <nav
        aria-label="Menu utama"
        className="dock-scroll pointer-events-auto flex max-w-full items-end gap-1 overflow-x-auto overscroll-x-contain rounded-[26px] border border-line bg-white/85 px-3 pb-1.5 pt-2.5 shadow-[0_16px_40px_rgba(43,89,240,0.12),0_2px_6px_rgba(11,15,26,0.06)] backdrop-blur-xl"
      >
        {umum.map((i) => (
          <DockItem key={i.href} item={i} aktif={aktif(i.href)} />
        ))}
        {admin.length > 0 && <span aria-hidden className="mx-1.5 mb-5 mt-1 w-px shrink-0 self-stretch bg-[#E0E3EC]" />}
        {admin.map((i) => (
          <DockItem key={i.href} item={i} aktif={aktif(i.href)} />
        ))}
      </nav>
    </div>
  );
}

function DockItem({ item, aktif }: { item: Item; aktif: boolean }) {
  const Ikon = item.ikon;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={aktif ? "page" : undefined}
      className="dock-item flex min-w-[62px] shrink-0 flex-col items-center gap-1 px-0.5"
    >
      <span
        className={clsx(
          "dock-tile relative flex size-[46px] items-center justify-center rounded-[14px] border",
          aktif ? "border-ink bg-ink text-white" : "border-line bg-white text-ink",
        )}
      >
        <Ikon size={22} strokeWidth={1.8} aria-hidden />
        {item.badge ? (
          <span className="absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-brand px-1 text-[11px] font-bold text-white">
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className={clsx("whitespace-nowrap text-[11px]", aktif ? "font-bold text-ink" : "font-medium text-ink-2")}>
        {item.label}
      </span>
      <span aria-hidden className={clsx("size-1 rounded-full", aktif ? "bg-brand" : "bg-transparent")} />
    </Link>
  );
}
