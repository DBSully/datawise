import { redirect } from "next/navigation";

export default function LegacyAnalysesRedirect() {
  redirect("/deals/watchlist");
}
