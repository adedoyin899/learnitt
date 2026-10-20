import { redirect } from "next/navigation";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/goals/${id}/graph`);
}
