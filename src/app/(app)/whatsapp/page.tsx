import Link from "next/link";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import clsx from "clsx";
import { db } from "@/db";
import { nasabah, polis, waLog, waOptout, waTemplate } from "@/db/schema";
import { wajibLogin } from "@/lib/auth/session";
import { FormAksi } from "@/components/form-aksi";
import { IsianPanjang, Kartu, KepalaHalaman, Kosong, Lencana } from "@/components/ui";
import { CONTOH, VARIABEL_TEMPLATE } from "@/lib/domain/variabel-wa";
import { rapikan, renderTemplate } from "@/lib/domain/template";
import { formatNoWa } from "@/lib/wa";
import { hapusOptout, simpanTemplate } from "./actions";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

const TAB = { template: "Template pesan", log: "Log pesan", optout: "Berhenti berlangganan" } as const;
const NADA_STATUS = { antre: "warn", terkirim: "netral", diterima: "brand", dibaca: "ok", gagal: "bad" } as const;
const jam = (d: Date) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);

export default async function HalamanWhatsApp({ searchParams }: { searchParams: Promise<{ tab?: string; arah?: string; jenis?: string; status?: string; q?: string }> }) {
  await wajibLogin("admin");
  const sp = await searchParams;
  const tab = (sp.tab && sp.tab in TAB ? sp.tab : "template") as keyof typeof TAB;
  const token = !!process.env.FONNTE_TOKEN;
  const dryRun = process.env.FONNTE_DRY_RUN === "1";
  const app = process.env.APP_URL ?? "https://insurance.ide.asia";

  return (
    <>
      <KepalaHalaman jejak={[{ label: "WhatsApp" }]} judul="WhatsApp" sorot="kantor" sub="Semua pesan sistem dikirim dari satu nomor WhatsApp kantor lewat Fonnte." />
      <Kartu className="flex flex-col gap-2 text-sm" data-uji="status-fonnte">
        <div className="flex flex-wrap items-center gap-2">
          <b>Status Fonnte:</b>
          {token && !dryRun ? <Lencana nada="ok">TERHUBUNG (TOKEN DIISI)</Lencana> : dryRun ? <Lencana nada="warn">MODE UJI — PESAN HANYA DICATAT DI LOG</Lencana> : <Lencana nada="bad">FONNTE_TOKEN BELUM DIISI — CADANGAN WA.ME</Lencana>}
          {!process.env.FONNTE_WEBHOOK_SECRET && <Lencana nada="warn">FONNTE_WEBHOOK_SECRET BELUM DIISI</Lencana>}
        </div>
        <p className="text-[13px] text-ink-3">
          Webhook di dashboard Fonnte → pesan masuk: <code className="break-all rounded bg-canvas px-1">{app}/api/webhook/fonnte?k=…</code> · status pesan:{" "}
          <code className="break-all rounded bg-canvas px-1">{app}/api/webhook/fonnte-status?k=…</code> (k = FONNTE_WEBHOOK_SECRET)
        </p>
      </Kartu>
      <nav aria-label="Bagian" className="overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold">
          {(Object.keys(TAB) as (keyof typeof TAB)[]).map((t) => (
            <li key={t}>
              <Link href={`/whatsapp?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={clsx("flex whitespace-nowrap rounded-full px-3.5 py-1.5", t === tab ? "bg-ink text-white" : "text-ink-2")}>
                {TAB[t]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "template" && <Template />}
      {tab === "log" && <Log sp={sp} />}
      {tab === "optout" && <Optout />}
    </>
  );
}

async function Template() {
  const daftar = await db.select().from(waTemplate).orderBy(asc(waTemplate.nama));
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {daftar.map((t) => {
        const vars = VARIABEL_TEMPLATE[t.kode] ?? [];
        return (
          <Kartu key={t.id} className="flex flex-col gap-3" data-uji={`template-${t.kode}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">{t.nama}</h2>
              {t.aktif ? <Lencana nada="ok">AKTIF</Lencana> : <Lencana>NONAKTIF</Lencana>}
            </div>
            <div className="rounded-2xl bg-[#E7F7EC] p-3 text-[13px] leading-relaxed whitespace-pre-line text-ink">
              {rapikan(renderTemplate(t.isi, CONTOH))}
            </div>
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-brand">Ubah template</summary>
              <div className="pt-3">
                <FormAksi aksi={simpanTemplate.bind(null, t.id)} tombol="Simpan template" varian="kedua">
                  <IsianPanjang label="Isi pesan" name="isi" defaultValue={t.isi} required />
                  {vars.length > 0 && (
                    <p className="text-[12px] text-ink-3">
                      Variabel: {vars.map((v) => (
                        <code key={v} className="mr-1 rounded bg-canvas px-1">{`{${v}}`}</code>
                      ))}
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="aktif" defaultChecked={t.aktif} className="size-4 accent-ink" /> Aktif (nonaktif = pesan ini tidak dikirim)
                  </label>
                </FormAksi>
              </div>
            </details>
          </Kartu>
        );
      })}
    </div>
  );
}

async function Log({ sp }: { sp: { arah?: string; jenis?: string; status?: string; q?: string } }) {
  const syarat: (SQL | undefined)[] = [
    sp.arah === "keluar" || sp.arah === "masuk" ? eq(waLog.arah, sp.arah) : undefined,
    sp.jenis ? eq(waLog.jenis, sp.jenis as typeof waLog.$inferSelect.jenis) : undefined,
    sp.status ? eq(waLog.status, sp.status as typeof waLog.$inferSelect.status) : undefined,
    sp.q ? or(ilike(waLog.nomorTujuan, `%${sp.q.replace(/\D/g, "") || sp.q}%`), ilike(waLog.isi, `%${sp.q}%`)) : undefined,
  ];
  const rows = await db
    .select({ l: waLog, kode: polis.kode, nasabah: nasabah.nama })
    .from(waLog)
    .leftJoin(polis, eq(polis.id, waLog.polisId))
    .leftJoin(nasabah, eq(nasabah.id, polis.nasabahId))
    .where(and(...syarat))
    .orderBy(desc(waLog.waktu))
    .limit(150);
  const kelas = "h-10 rounded-full border border-line-2 bg-white px-3.5 text-sm font-semibold";
  return (
    <>
      <form className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="log" />
        <select name="arah" defaultValue={sp.arah ?? ""} aria-label="Arah" className={kelas}>
          <option value="">Semua arah</option>
          <option value="keluar">Keluar</option>
          <option value="masuk">Masuk</option>
        </select>
        <select name="jenis" defaultValue={sp.jenis ?? ""} aria-label="Jenis" className={kelas}>
          <option value="">Semua jenis</option>
          {["otp", "instruksi_bayar", "remind", "notifikasi", "kirim_asuransi", "balasan", "tracker"].map((j) => (
            <option key={j} value={j}>
              {j.replace("_", " ")}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className={kelas}>
          <option value="">Semua status</option>
          {Object.keys(NADA_STATUS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Nomor atau isi pesan" className={`${kelas} font-normal`} aria-label="Cari" />
        <button className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white">Terapkan</button>
      </form>
      {rows.length === 0 ? (
        <Kosong>Tidak ada pesan.</Kosong>
      ) : (
        <Kartu className="p-0">
          <ul className="divide-y divide-line" data-uji="log-wa">
            {rows.map(({ l, kode, nasabah: nm }) => (
              <li key={l.id} className="flex flex-col gap-1 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Lencana nada={l.arah === "masuk" ? "brand" : "netral"}>{l.arah === "masuk" ? "MASUK" : "KELUAR"}</Lencana>
                  <b>{formatNoWa(l.nomorTujuan)}</b>
                  {nm && <span className="text-ink-3">{nm}</span>}
                  {kode && l.polisId && (
                    <Link href={`/pengajuan/${l.polisId}`} className="font-semibold text-brand">
                      {kode}
                    </Link>
                  )}
                  <span className="text-ink-3">· {l.jenis.replace("_", " ")} · {jam(l.waktu)}</span>
                  <Lencana nada={NADA_STATUS[l.status]}>{l.kanal === "wame" && l.status === "antre" ? "WA.ME" : l.status.toUpperCase()}</Lencana>
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-[13px] text-ink-2">{l.jenis === "otp" ? "Kode OTP (disembunyikan)" : l.isi}</p>
              </li>
            ))}
          </ul>
        </Kartu>
      )}
    </>
  );
}

async function Optout() {
  const rows = await db.select().from(waOptout).orderBy(desc(waOptout.waktu));
  return rows.length === 0 ? (
    <Kosong>Belum ada nomor yang membalas BERHENTI.</Kosong>
  ) : (
    <Kartu className="p-0">
      <ul className="divide-y divide-line" data-uji="optout">
        {rows.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span>
              <b>{formatNoWa(o.nomor)}</b> <span className="text-ink-3">· {o.jenisPesan} · {jam(o.waktu)}</span>
            </span>
            <form action={hapusOptout.bind(null, o.id)}>
              <button className="text-[13px] font-semibold text-brand">Kirimi lagi</button>
            </form>
          </li>
        ))}
      </ul>
    </Kartu>
  );
}
