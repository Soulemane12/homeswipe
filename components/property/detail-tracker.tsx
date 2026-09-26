"use client";

import { useEffect } from "react";
import { track } from "@/lib/client/track";

/**
 * Records a weak `detail_open` signal once per visit, with dwell time, when the user leaves
 * the page (keepalive so it survives navigation). Long dwell adds a small positive bonus.
 */
export function DetailTracker({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    const started = Date.now();
    let sent = false;
    const send = () => {
      // Ignore sub-250ms "visits" (React Strict Mode's dev-only mount/unmount/mount cycle).
      if (sent || Date.now() - started < 250) return;
      sent = true;
      track({ type: "detail_open", propertyId, dwellMs: Date.now() - started, sourceSurface: "property" }, { keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("pagehide", send);
    return () => {
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [propertyId]);
  return null;
}
