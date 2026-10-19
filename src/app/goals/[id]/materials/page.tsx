import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GoalMaterialsPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/materials?goal_id=${id}`);
}
