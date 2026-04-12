import { redirect } from "next/navigation";

export default function LegacyPipelineRedirect() {
  redirect("/action");
}
