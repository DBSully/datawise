import { redirect } from "next/navigation";

export default function LegacyQueueRedirect() {
  redirect("/intake/screening");
}
