import FeedbackClient from "@/components/FeedbackClient";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export default async function FeedbackPage() {
  await requireAuthenticatedUser();
  return <FeedbackClient />;
}
