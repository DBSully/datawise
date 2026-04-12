"use client";

import { signOutAction } from "@/app/auth/actions";

export function PortalSignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOutAction()}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
    >
      Sign out
    </button>
  );
}
