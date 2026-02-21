import { redirect } from "next/navigation";
import { HistoryRunDetailClient } from "@/app/history/[runId]/run-detail-client";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";

type Params = {
  params: Promise<{ runId: string }>;
};

export default async function HistoryRunDetailPage({ params }: Params) {
  const { runId } = await params;
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    redirect(`/login?next=${encodeURIComponent(`/history/${runId}`)}`);
  }

  return <HistoryRunDetailClient runId={runId} />;
}
