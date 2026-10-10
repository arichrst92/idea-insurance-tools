"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { aksiLogout } from "@/app/login/actions";
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
  LogOut,
  Bell,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; ikon: LucideIcon; admin?: boolean; badge?: number };

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

export function Dock({ role, nama, belumDibaca = 0 }: { role: "admin" | "sales"; nama: string; belumDibaca?: number }) {
  const path = usePathname();
  const aktif = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const umum = ITEMS.filter((i) => !i.admin);
  const admin = role === "admin" ? ITEMS.filter((i) => i.admin) : [];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
      <div className="pointer-events-auto flex max-w-full items-end rounded-[26px] border border-line bg-white/85 shadow-[0_16px_40px_rgba(43,89,240,0.12),0_2px_6px_rgba(11,15,26,0.06)] backdrop-blur-xl">
        <nav aria-label="Menu utama" className="dock-scroll flex min-w-0 items-end gap-1 overflow-x-auto overscroll-x-contain pb-1.5 pl-3 pr-1 pt-2.5">
          {umum.map((i) => (
            <DockItem key={i.href} item={i} aktif={aktif(i.href)} />
          ))}
          {admin.length > 0 && <span aria-hidden className="mx-1.5 mb-5 mt-1 w-px shrink-0 self-stretch bg-[#E0E3EC]" />}
          {admin.map((i) => (
            <DockItem key={i.href} item={i} aktif={aktif(i.href)} />
          ))}
        </nav>
        <span aria-hidden className="mb-5 mt-3 w-px shrink-0 self-stretch bg-[#E0E3EC]" />
        <div className="shrink-0 pb-1.5 pl-1 pt-2.5">
          <DockItem item={{ href: "/notifikasi", label: "Notifikasi", ikon: Bell, badge: belumDibaca }} aktif={aktif("/notifikasi")} />
        </div>
        <Akun nama={nama} role={role} />
      </div>
    </div>
  );
}

/** Akun & keluar: selalu terlihat di ujung kanan dock (tidak ikut tergulir). */
function Akun({ nama, role }: { nama: string; role: "admin" | "sales" }) {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", tutup);
    return () => {
      document.removeEventListener("mousedown", tutup);
      document.removeEventListener("keydown", tutup);
    };
  }, [buka]);
  const inisial = nama
    .split(/\s+/)
    .slice(0, 2)
    .map((k) => k[0])
    .join("")
    .toUpperCase();
  const depan = nama.split(/\s+/)[0];

  return (
    <div ref={ref} className="relative shrink-0 pb-1.5 pl-1 pr-3 pt-2.5">
      <button
        type="button"
        onClick={() => setBuka((b) => !b)}
        aria-expanded={buka}
        aria-haspopup="menu"
        aria-label={`Akun ${nama}`}
        className="dock-item flex min-w-[62px] flex-col items-center gap-1 px-0.5"
      >
        <span className="dock-tile flex size-[46px] items-center justify-center rounded-full border border-brand-edge bg-brand-soft text-[13px] font-extrabold text-brand-ink">
          {inisial}
        </span>
        <span className="max-w-[64px] truncate whitespace-nowrap text-[11px] font-medium text-ink-2">{depan}</span>
        <span aria-hidden className="size-1" />
      </button>
      {buka && (
        <div role="menu" className="absolute bottom-full right-2 mb-3 w-60 rounded-2xl border border-line bg-white p-2 shadow-[0_16px_40px_rgba(11,15,26,0.14)]">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-ink">{inisial}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{nama}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{role}</span>
            </span>
          </div>
          <form action={aksiLogout} className="border-t border-line pt-1.5">
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold text-bad hover:bg-bad-soft">
              <LogOut size={16} aria-hidden />
              Keluar
            </button>
          </form>
        </div>
      )}
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
            {item.badge > 99 ? "99+" : item.badge}
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
