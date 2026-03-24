import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppChrome } from "@/components/layout/app-chrome";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  return <AppChrome>{children}</AppChrome>;
}
