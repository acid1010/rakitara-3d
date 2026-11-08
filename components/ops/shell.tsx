"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  RiBox3Line,
  RiStackLine,
  RiPrinterLine,
  RiShoppingBag3Line,
  RiWallet3Line,
  RiSettings3Line,
  RiLayoutGridLine,
  RiLogoutBoxRLine,
  RiMenuLine,
  RiCloseLine,
  RiArrowRightUpLine,
  RiCheckLine,
} from "@remixicon/react";
import { sections } from "@/lib/contracts";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOperations } from "./provider";

const icons = {
  production: RiLayoutGridLine,
  materials: RiStackLine,
  products: RiBox3Line,
  sales: RiShoppingBag3Line,
  printers: RiPrinterLine,
  journal: RiWallet3Line,
  settings: RiSettings3Line,
};
const routeParents: Record<string, string> = {
  "/purchases": "/materials",
  "/adjustments": "/products",
  "/movements": "/products",
  "/maintenance": "/printers",
  "/entry/material": "/materials",
  "/entry/purchase": "/materials",
  "/entry/product": "/products",
  "/entry/adjustment": "/products",
  "/entry/printer": "/printers",
  "/entry/maintenance": "/printers",
  "/entry/sale": "/sales",
  "/entry/payment": "/sales",
  "/entry/job": "/",
  "/entry/finish": "/",
  "/entry/transaction": "/journal",
};

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Rakitara 3D production">
      <span className="brand-mark">
        <RiBox3Line aria-hidden="true" />
      </span>
      <span>
        rakitara<span className="brand-suffix">3D</span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { username, notice, notify } = useOperations();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const logoutLock = useRef(false);
  const parentPath = routeParents[pathname] ?? pathname;
  const current =
    sections.find((item) => item.path === parentPath)?.label ?? "Workspace";
  async function logout() {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      router.replace("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setLoggingOut(false);
      logoutLock.current = false;
    }
  }
  const navigation = (
    <nav aria-label="Main navigation">
      {sections.map(({ path, label, icon }) => {
        const Icon = icons[icon];
        const active = path === parentPath;
        return (
          <Link
            key={path}
            href={path}
            aria-current={active ? "page" : undefined}
            onClick={() => setMenu(false)}
            className={cn("nav-link", active && "is-active")}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
            {active && <span className="nav-active-dot" />}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="workspace">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-nav">{navigation}</div>
        <div className="sidebar-bottom">
          <div className="workspace-label">
            <span className="workspace-dot" />
            Owner workspace
          </div>
          <Separator />
          <div className="owner">
            <span className="owner-avatar">
              {username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{username}</strong>
              <span>Studio owner</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={logout}
              disabled={loggingOut}
            >
              <RiLogoutBoxRLine />
            </Button>
          </div>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="desktop-breadcrumb">
            Workspace <span>/</span> <strong>{current}</strong>
          </div>
          <div className="topbar-meta">
            <span>WIB · IDR</span>
            <Button
              className="mobile-menu-button"
              variant="ghost"
              size="icon"
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              aria-controls="mobile-navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <RiCloseLine /> : <RiMenuLine />}
            </Button>
            <Link href="/settings" className="help-link">
              Studio settings
              <RiArrowRightUpLine aria-hidden="true" />
            </Link>
          </div>
        </header>
        {menu && (
          <div id="mobile-navigation" className="mobile-navigation">
            {navigation}
            <Button variant="ghost" onClick={logout} disabled={loggingOut}>
              <RiLogoutBoxRLine data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        )}
        <main id="main-content" className="main-content">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <div className="save-notice" role="status">
              <RiCheckLine aria-hidden="true" />
              <span>{notice}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss notification"
                onClick={() => notify("")}
              >
                <RiCloseLine />
              </Button>
            </div>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Rakitara 3D</span>
          <span>Made for the work behind the print.</span>
        </footer>
      </div>
    </div>
  );
}
