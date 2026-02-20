import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/auth-server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await getSupabaseServerAuthClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectUrl = new URL(nextPath, url.origin);
  return NextResponse.redirect(redirectUrl);
}

