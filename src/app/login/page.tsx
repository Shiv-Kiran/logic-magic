import { resolveSafeNextPath } from "@/lib/auth/redirect";
import { LoginPageClient } from "@/app/login/login-page-client";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = resolveSafeNextPath(params.next ?? null);

  return <LoginPageClient nextPath={nextPath} />;
}
