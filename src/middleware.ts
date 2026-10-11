import { NextResponse, type NextRequest } from "next/server";

// Middleware tidak menyentuh database: hanya mengarahkan tamu ke /login dan
// memperpanjang umur cookie "ingat perangkat" (sliding 30 hari). Validasi
// sesi sebenarnya ada di wajibLogin() pada setiap halaman/aksi.

const NAMA_COOKIE = "ria_sid";
const UMUR_DETIK = 30 * 24 * 60 * 60;
const PUBLIK = ["/login", "/t/", "/p/", "/api/webhook/", "/api/cron/", "/cetak/", "/api/sehat", "/manifest.webmanifest"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(NAMA_COOKIE)?.value;
  const publik = PUBLIK.some((p) => pathname === p || pathname.startsWith(p));

  if (!token && !publik) {
    // Di belakang Nginx, req.nextUrl berisi host internal (localhost:3100). Pakai host asli
    // dari header Host / X-Forwarded-* agar browser tidak diarahkan ke localhost.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "");
    return NextResponse.redirect(new URL("/login", `${proto}://${host}`));
  }

  const res = NextResponse.next();
  if (token?.startsWith("r.")) {
    res.cookies.set(NAMA_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: UMUR_DETIK,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
