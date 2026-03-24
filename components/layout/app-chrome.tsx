"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppChromeProps = {
  children: ReactNode;
};

type SectionConfig = {
  title: string;
  subtitle: string;
  tabs: { href: string; label: string; exact?: boolean }[];
};

const primaryNav = [
  { href: "/reports", label: "Reports" },
  { href: "/analysis/properties", label: "Analysis" },
  { href: "/admin", label: "Admin" },
];

function getSectionConfig(pathname: string): SectionConfig {
  if (pathname.startsWith("/analysis")) {
    return {
      title: "Analysis",
      subtitle:
        "Internal intake, underwriting, and report-generation workspace.",
      tabs: [
        { href: "/analysis/properties", label: "Properties", exact: true },
        {
          href: "/analysis/properties/new",
          label: "Manual Entry",
          exact: true,
        },
        { href: "/analysis/imports", label: "Imports", exact: true },
        { href: "/analysis/analyses", label: "Analyses", exact: true },
      ],
    };
  }

  if (pathname.startsWith("/reports")) {
    return {
      title: "Reports",
      subtitle: "Client-facing reports and deliverables.",
      tabs: [{ href: "/reports", label: "Report Library", exact: true }],
    };
  }

  if (pathname.startsWith("/admin")) {
    return {
      title: "Admin",
      subtitle: "Configuration, mappings, and administrative controls.",
      tabs: [{ href: "/admin", label: "Overview", exact: true }],
    };
  }

  return {
    title: "Workspace",
    subtitle: "DataWise application workspace.",
    tabs: [],
  };
}

function getPageLabel(pathname: string): string {
  if (pathname === "/analysis/properties") return "Properties";
  if (pathname === "/analysis/properties/new") return "Manual Entry";
  if (pathname.startsWith("/analysis/properties/")) return "Property Detail";
  if (pathname === "/analysis/imports") return "Imports";
  if (pathname === "/analysis/analyses") return "Analyses";

  if (pathname === "/reports") return "Report Library";
  if (pathname.startsWith("/reports/")) return "Report Detail";

  if (pathname === "/admin") return "Admin Overview";

  return "Overview";
}

function isPrimaryActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isTabActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function primaryLinkClass(active: boolean) {
  return [
    "rounded-md px-2.5 py-1 text-sm transition-colors",
    active
      ? "bg-slate-800 text-white"
      : "text-slate-300 hover:bg-slate-900 hover:text-white",
  ].join(" ");
}

function tabLinkClass(active: boolean) {
  return [
    "rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-[0.14em] transition-colors whitespace-nowrap",
    active
      ? "bg-white text-slate-900 shadow-sm"
      : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
  ].join(" ");
}

export function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname() ?? "/";
  const section = getSectionConfig(pathname);
  const pageLabel = getPageLabel(pathname);

  return (
    <div className="min-h-screen bg-[var(--dw-bg)] text-[var(--dw-text)]">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-slate-100">
        <div className="flex h-[var(--dw-header-height)] items-center justify-between gap-4 px-[var(--dw-page-pad-x)]">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/analysis/properties"
              className="shrink-0 text-sm font-semibold uppercase tracking-[0.22em] text-white"
            >
              DataWise
            </Link>

            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={primaryLinkClass(
                    isPrimaryActive(pathname, item.href),
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <span className="rounded-md border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
              Denver MVP
            </span>
          </div>
        </div>
      </header>

      <div className="sticky top-[var(--dw-header-height)] z-30 border-b border-[var(--dw-border)] bg-white/95 backdrop-blur">
        <div className="flex h-[var(--dw-subheader-height)] items-center justify-between gap-4 px-[var(--dw-page-pad-x)]">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <span className="truncate text-sm font-semibold text-slate-900">
              {section.title}
            </span>
            <span className="text-slate-400">/</span>
            <span className="truncate text-sm text-slate-600">{pageLabel}</span>
          </div>

          <p className="hidden truncate text-xs text-slate-500 lg:block">
            {section.subtitle}
          </p>
        </div>
      </div>

      <div className="sticky top-[calc(var(--dw-header-height)+var(--dw-subheader-height))] z-20 border-b border-[var(--dw-border)] bg-slate-100/95 backdrop-blur">
        <div className="flex h-[var(--dw-subheader-2-height)] items-center justify-between gap-4 px-[var(--dw-page-pad-x)]">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {section.tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={tabLinkClass(
                  isTabActive(pathname, tab.href, tab.exact),
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          <div className="hidden text-[11px] uppercase tracking-[0.16em] text-slate-500 md:block">
            Dense mode • full-width workspace
          </div>
        </div>
      </div>

      <main className="px-[var(--dw-page-pad-x)] py-[var(--dw-page-pad-y)]">
        {children}
      </main>
    </div>
  );
}
