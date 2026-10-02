import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string; stageId: string }> };

export default async function InterviewStagePage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/campaigns/${id}/interviews`);
}
