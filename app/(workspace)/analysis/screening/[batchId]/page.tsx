import { redirect } from "next/navigation";

type Props = { params: Promise<{ batchId: string }> };

export default async function LegacyBatchRedirect({ params }: Props) {
  const { batchId } = await params;
  redirect(`/intake/screening/${batchId}`);
}
