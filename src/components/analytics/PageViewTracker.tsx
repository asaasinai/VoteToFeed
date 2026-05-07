"use client";

import { useEffect } from "react";
import { trackPostHogEvent } from "@/lib/analytics";

type PageViewTrackerProps = {
  eventName: string;
  properties?: Record<string, unknown>;
};

export function PageViewTracker({ eventName, properties = {} }: PageViewTrackerProps) {
  useEffect(() => {
    trackPostHogEvent(eventName, properties);
  }, [eventName, properties]);

  return null;
}
