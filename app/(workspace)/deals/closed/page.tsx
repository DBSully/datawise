import { redirect } from "next/navigation";

export default function LegacyClosedDealsRedirect() {
  redirect("/action?status=closed");
}
