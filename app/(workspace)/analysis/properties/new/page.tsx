import { redirect } from "next/navigation";

export default function LegacyNewPropertyRedirect() {
  redirect("/admin/properties/new");
}
