import RegistrationFormClient from "@/components/RegistrationFormClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

function safeReturnTo(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/registrations";
  }
  return value;
}

export default async function EditRegistrationPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  await requireAuthenticatedUser();
  return <RegistrationFormClient registrationId={id} returnTo={safeReturnTo(returnTo)} />;
}
