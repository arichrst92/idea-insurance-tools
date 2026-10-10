import { wajibLogin } from "@/lib/auth/session";

export default async function LayoutMaster({ children }: { children: React.ReactNode }) {
  await wajibLogin("admin");
  return children;
}
