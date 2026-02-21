import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-server";

export default async function HomePage() {
  const userId = await getAuthenticatedUserId();
  redirect(userId ? "/ide" : "/about");
}
