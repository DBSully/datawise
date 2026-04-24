import { redirect } from "next/navigation";

export default function LegacyClosedDealsRedirect() {
  redirect("/pipeline?view=closed");
}
