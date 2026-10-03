import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "./actions";
import { Nav } from "./Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            Content<span>Studio</span>
          </Link>
          <Nav />
          <form action={logoutAction}>
            <button className="btn small" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
