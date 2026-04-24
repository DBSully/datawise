import { redirect } from "next/navigation";

export default function LegacyPipelineRedirect() {
  redirect("/pipeline?view=action");
}
