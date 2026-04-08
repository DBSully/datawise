import { redirect } from "next/navigation";

export default function LegacyManualEntryRedirect() {
  redirect("/intake/manual");
}
