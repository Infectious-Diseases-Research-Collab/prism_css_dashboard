"use client";

import { useEffect } from "react";

// Survives page-component remounts during tab/filter navigation. A full browser
// load resets this module, including refreshes and a new browser tab.
let recordedThisOpening = false;

export function DashboardAccessTracker() {
  useEffect(() => {
    if (recordedThisOpening) return;
    recordedThisOpening = true;
    void fetch("/api/dashboard-access", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      // Tracking is best-effort and must never affect dashboard navigation.
    });
  }, []);

  return null;
}
