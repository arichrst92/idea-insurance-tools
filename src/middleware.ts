import { NextResponse, type NextRequest } from "next/server";

// Middleware tidak menyentuh database: hanya mengarahkan tamu ke /login dan
// memperpanjang umur cookie "ingat perangkat" (sliding 30 hari). Validasi
// sesi sebenarnya ada di wajibLogin() pada setiap halaman/aksi.

const NAMA_COOKIE = "ria_sid";
const UMUR_DETIK = 30 * 24 * 60 * 60;
const PUBLIK = ["/login", "/t/", "/p/", "/api/webhook/", "/api/cron/", "/cetak/", "/api/sehat"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(NAMA_COOKIE)?.value;
  const publik = PUBLIK.some((p) => pathname === p || pathname.startsWith(p));

  if (!token && !publik) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
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
