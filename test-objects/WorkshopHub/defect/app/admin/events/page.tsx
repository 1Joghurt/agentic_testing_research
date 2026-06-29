import AdminEventsClient from "@/components/MyWorkshows";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export default async function AdminEventsPage() {
  await requireAuthenticatedUser();
  return <AdminEventsClient />;
}
