import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string; analysisId: string }> };

export default async function LegacyAnalysisRedirect({ params }: Props) {
  const { analysisId } = await params;
  redirect(`/deals/watchlist/${analysisId}`);
}
