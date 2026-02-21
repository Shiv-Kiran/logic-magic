import { redirect } from "next/navigation";
import { HistoryPageClient } from "@/app/history/history-page-client";
import { buildLoginRedirect } from "@/lib/auth/redirect";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";

export default async function HistoryPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect(buildLoginRedirect("/history"));
  }

  return <HistoryPageClient />;
}
