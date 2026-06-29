export const SUCCESS_QUERY_PARAM = "success";

export const successMessages = {
  "event-created": "Event created successfully.",
  "event-updated": "Event updated successfully.",
  "event-cancelled": "Event cancelled successfully.",
  "registration-created": "Registration confirmed successfully.",
  "registration-updated": "Registration updated successfully.",
  "registration-cancelled": "Registration cancelled successfully. Event capacity has been restored.",
  "feedback-submitted": "Feedback submitted successfully. Thank you!",
  "login-completed": "You are logged in.",
  "registration-completed": "Account created successfully.",
} as const;

export type SuccessCode = keyof typeof successMessages;

export function withSuccessBanner(path: string, code: SuccessCode): string {
  const url = new URL(path, "http://workshophub.local");
  url.searchParams.set(SUCCESS_QUERY_PARAM, code);
  return `${url.pathname}${url.search}${url.hash}`;
}
