import { redirect } from "next/navigation";

export default function LegacyPropertiesRedirect() {
  redirect("/admin/properties");
}
