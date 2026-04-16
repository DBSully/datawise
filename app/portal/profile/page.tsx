import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { LocalTimestamp } from "@/components/common/local-timestamp";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  noStore();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/portal/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, created_at")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/auth/sign-in");

  return (
    <section className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900">Your Profile</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your account information.
      </p>

      <div className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        {/* Read-only fields */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Email
          </label>
          <p className="mt-0.5 text-sm text-slate-900">{profile.email}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Role
          </label>
          <p className="mt-0.5 text-sm text-slate-900 capitalize">
            {profile.role}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Member since
          </label>
          <p className="mt-0.5 text-sm text-slate-900">
            <LocalTimestamp value={profile.created_at} format="date" />
          </p>
        </div>

        {/* Editable name */}
        <ProfileForm initialName={profile.full_name ?? ""} />
      </div>
    </section>
  );
}
