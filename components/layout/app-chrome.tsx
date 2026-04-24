"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/auth/actions";

type AppChromeProps = {
  children: ReactNode;
};

type SectionTab = {
  href: string;
  label: string;
  exact?: boolean;
  // Optional custom matcher used when the default pathname-only check is
  // insufficient (e.g. tabs that differ only by query string, like the
  // /action Pipeline vs Closed pair which share `/action` and switch on
  // `?status=`).
  isActive?: (pathname: string, searchParams: URLSearchParams) => boolean;
};

type SectionConfig = {
  title: string;
  subtitle: string;
  tabs: SectionTab[];
};

const primaryNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intake", label: "Intake" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/reports", label: "Reports" },
  { href: "/admin", label: "Admin" },
];

function getSectionConfig(pathname: string): SectionConfig {
  if (pathname === "/dashboard") {
    return {
      title: "Dashboard",
      subtitle: "Daily overview of pipeline, screening, and imports.",
      tabs: [{ href: "/dashboard", label: "Dashboard", exact: true }],
    };
  }

  if (pathname.startsWith("/intake")) {
    return {
      title: "Intake",
      subtitle: "Import data and add properties.",
      tabs: [
        { href: "/intake/imports", label: "Imports", exact: true },
        { href: "/intake/manual", label: "Manual Entry", exact: true },
      ],
    };
  }

  if (pathname.startsWith("/pipeline") || pathname.startsWith("/screening")) {
    return {
      title: "Pipeline",
      subtitle: "Every property you're tracking — screening, watch list, action.",
      tabs: [{ href: "/pipeline", label: "Pipeline" }],
    };
  }

  // /analysis/[analysisId] still renders the workstation (the per-property
  // detail page). The bare /analysis route redirects to /pipeline?view=focus.
  // Breadcrumb stays as "Analysis" so the workstation context is clear.
  if (pathname.startsWith("/analysis")) {
    return {
      title: "Analysis",
      subtitle:
        "Deep underwriting of a single property — comps, ARV, rehab, deal math.",
      tabs: [{ href: "/pipeline?view=focus", label: "← Back to Pipeline" }],
    };
  }

  // /action is now just a redirect to /pipeline?view=action; the section
  // config only matters if the redirect hasn't fired yet.
  if (pathname.startsWith("/action")) {
    return {
      title: "Pipeline",
      subtitle: "Every property you're tracking — screening, watch list, action.",
      tabs: [{ href: "/pipeline", label: "Pipeline" }],
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
      subtitle: "Configuration, properties browser, and system tools.",
      tabs: [
        { href: "/admin", label: "Overview", exact: true },
        { href: "/admin/properties", label: "Properties" },
      ],
    };
  }

  return {
    title: "Workspace",
    subtitle: "DataWise application workspace.",
    tabs: [],
  };
}

function getPageLabel(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  if (pathname === "/dashboard") return "Dashboard";

  if (pathname === "/intake/imports") return "Imports";
  if (pathname === "/intake/manual") return "Manual Entry";

  if (pathname === "/pipeline") return "Pipeline";
  if (pathname.startsWith("/pipeline/")) return "Pipeline";
  // Legacy URLs — redirects handle navigation, but breadcrumbs may render
  // briefly before the redirect takes effect.
  if (pathname === "/screening") return "Pipeline";
  if (pathname.startsWith("/screening/")) return "Pipeline";

  // /analysis (list) redirects to /pipeline; workstation pages still render.
  if (pathname === "/analysis") return "Pipeline";
  if (pathname.startsWith("/analysis/")) return "Analysis Workstation";
  // /action redirects to /pipeline.
  if (pathname === "/action") return "Pipeline";

  if (pathname === "/reports") return "Report Library";
  if (pathname.startsWith("/reports/")) return "Report Detail";

  if (pathname === "/admin") return "Admin Overview";
  if (pathname === "/admin/properties") return "Properties";
  if (pathname === "/admin/properties/new") return "Manual Entry";
  if (pathname.startsWith("/admin/properties/")) return "Property Detail";

  return "Overview";
}

function isPrimaryActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isTabActive(
  pathname: string,
  searchParams: URLSearchParams,
  tab: SectionTab,
) {
  if (tab.isActive) return tab.isActive(pathname, searchParams);
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
  const rawSearchParams = useSearchParams();
  const searchParams = rawSearchParams ?? new URLSearchParams();
  const section = getSectionConfig(pathname);
  const pageLabel = getPageLabel(pathname, searchParams);

  return (
    <div className="min-h-screen bg-[var(--dw-bg)] text-[var(--dw-text)]">
      <header data-print-hide className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-slate-100">
        <div className="flex h-[var(--dw-header-height)] items-center justify-between gap-4 px-[var(--dw-page-pad-x)]">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/dashboard"
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
            <Link href="/offerings" className="text-[11px] text-slate-400 hover:text-white">
              Offerings
            </Link>
            <Link href="/methodology" className="text-[11px] text-slate-400 hover:text-white">
              Methodology
            </Link>
            <Link href="/contact" className="text-[11px] text-slate-400 hover:text-white">
              Contact
            </Link>
            <span className="mx-1 text-slate-700">|</span>
            <span className="rounded-md border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
              Denver MVP
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300 hover:bg-slate-900 hover:text-white"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div data-print-hide className="sticky top-[var(--dw-header-height)] z-30 border-b border-[var(--dw-border)] bg-white/95 backdrop-blur">
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

      <div data-print-hide className="sticky top-[calc(var(--dw-header-height)+var(--dw-subheader-height))] z-20 border-b border-[var(--dw-border)] bg-slate-100/95 backdrop-blur">
        <div className="flex h-[var(--dw-subheader-2-height)] items-center justify-between gap-4 px-[var(--dw-page-pad-x)]">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {section.tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={tabLinkClass(
                  isTabActive(pathname, searchParams, tab),
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
