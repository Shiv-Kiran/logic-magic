import { redirect } from "next/navigation";
import { HistoryPageClient } from "@/app/history/history-page-client";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";

export default async function HistoryPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/login?next=/history");
  }

  return <HistoryPageClient />;
}
