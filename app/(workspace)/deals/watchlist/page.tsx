import { redirect } from "next/navigation";

export default function LegacyWatchListRedirect() {
  redirect("/analysis");
}
