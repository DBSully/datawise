import { redirect } from "next/navigation";

export default function LegacyScreeningRedirect() {
  redirect("/intake/imports");
}
