import RegistrationFormClient from "@/components/RegistrationFormClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventRegistrationPage({ params }: PageProps) {
  const { id } = await params;
  await requireAuthenticatedUser();
  return <RegistrationFormClient eventId={id} returnTo={`/events/${id}`} />;
}
