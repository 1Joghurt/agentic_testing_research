import RegistrationsClient from "@/components/RegistrationsClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export default async function RegistrationsPage() {
  await requireAuthenticatedUser();
  return <RegistrationsClient />;
}
