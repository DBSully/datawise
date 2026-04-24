// Legacy /deals/watchlist — both this and /analysis are now absorbed
// into /pipeline?view=focus. Redirect points directly at /pipeline to
// avoid a double-hop.
import { redirect } from "next/navigation";

export default function LegacyWatchListRedirect() {
  redirect("/pipeline?view=focus");
}
