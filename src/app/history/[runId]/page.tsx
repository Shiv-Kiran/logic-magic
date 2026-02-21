import { redirect } from "next/navigation";
import { HistoryRunDetailClient } from "@/app/history/[runId]/run-detail-client";
import { buildLoginRedirect } from "@/lib/auth/redirect";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";

type Params = {
  params: Promise<{ runId: string }>;
};

export default async function HistoryRunDetailPage({ params }: Params) {
  const { runId } = await params;
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    redirect(buildLoginRedirect(`/history/${runId}`));
  }

  return <HistoryRunDetailClient runId={runId} />;
}
