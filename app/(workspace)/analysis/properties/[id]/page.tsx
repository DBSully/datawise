import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyPropertyRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/admin/properties/${id}`);
}
