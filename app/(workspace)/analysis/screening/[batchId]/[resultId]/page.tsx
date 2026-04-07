import { redirect } from "next/navigation";

type Props = { params: Promise<{ batchId: string; resultId: string }> };

export default async function LegacyResultRedirect({ params }: Props) {
  const { batchId, resultId } = await params;
  redirect(`/intake/screening/${batchId}/${resultId}`);
}
