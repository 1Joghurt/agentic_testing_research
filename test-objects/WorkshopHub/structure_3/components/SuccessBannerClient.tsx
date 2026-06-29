"use client";

import { CheckCircle2, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SUCCESS_QUERY_PARAM, successMessages, type SuccessCode } from "@/lib/success-banner";

function isSuccessCode(value: string | null): value is SuccessCode {
  return Boolean(value && value in successMessages);
}

export default function SuccessBannerClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const code = searchParams.get(SUCCESS_QUERY_PARAM);
  const message = isSuccessCode(code) ? successMessages[code] : "";
  const [visibleMessage, setVisibleMessage] = useState("");

  const cleanedUrl = useMemo(() => {
    if (!message) return "";
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(SUCCESS_QUERY_PARAM);
    const query = nextParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [message, pathname, searchParams]);

  useEffect(() => {
    if (!message) return;

    setVisibleMessage(message);
    if (cleanedUrl) {
      window.history.replaceState(null, "", cleanedUrl);
    }

    const timer = window.setTimeout(() => {
      setVisibleMessage("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [cleanedUrl, message]);

  if (!visibleMessage) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-20 z-[70] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 px-0 sm:w-full">
      <div
        className="success-banner pointer-events-auto rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"
        role="status"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{visibleMessage}</span>
          <button
            type="button"
            className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            aria-label="Dismiss success message"
            onClick={() => setVisibleMessage("")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
