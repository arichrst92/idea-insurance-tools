"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TAB = [
  { href: "/master/asuransi", label: "Asuransi" },
  { href: "/master/kategori", label: "Kategori polis" },
  { href: "/master/bengkel", label: "Bengkel" },
  { href: "/master/rekening", label: "Rekening kantor" },
];

export function TabMaster() {
  const path = usePathname();
  return (
    <nav aria-label="Master data" className="-mt-2">
      <ul className="flex gap-1 overflow-x-auto rounded-full border border-line bg-white p-1 text-[13px] font-semibold sm:inline-flex">
        {TAB.map((t) => {
          const aktif = path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={aktif ? "page" : undefined}
                className={clsx(
                  "block whitespace-nowrap rounded-full px-3.5 py-1.5",
                  aktif ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
