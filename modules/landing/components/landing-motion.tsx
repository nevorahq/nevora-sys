"use client";

import { useEffect } from "react";

/**
 * Adds viewport-based section reveals without moving the whole landing page
 * into the client bundle. With JavaScript disabled every section stays visible.
 */
export function LandingMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-landing-page] main > section"),
    ).slice(1);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("nv-section-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12%", threshold: 0.08 },
    );

    for (const section of sections) {
      section.classList.add("nv-section-reveal");
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
