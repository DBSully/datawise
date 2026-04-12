import { redirect } from "next/navigation";

type Props = { params: Promise<{ analysisId: string }> };

export default async function LegacyWorkstationRedirect({ params }: Props) {
  const { analysisId } = await params;
  redirect(`/analysis/${analysisId}`);
}
