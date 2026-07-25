"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";
import ScrollToPlugin from "gsap/ScrollToPlugin";
import { HoverScrambleText } from "./ui/HoverScrambleText";
import { getLenis } from "../lib/lenisInstance";
import { power4InOut } from "../lib/scrollTarget";

gsap.registerPlugin(ScrollToPlugin);

/* ─────────────────────────────────────────────────────────────────────
   Footer — a quiet, classy sign-off, not a marketing block.

   Three balanced zones on a 1fr/auto/1fr grid (the {J} logo doubles as
   back-to-top, the status line is dead-centered, the stack credit sits
   right), over a quiet copyright sub-row. Surface is a touch darker than
   --surface-0 so it reads as the floor of the page.
   ───────────────────────────────────────────────────────────────────── */

/** Formats the viewer's local time as  HH:MM:SS GMT±H:MM */
function formatLocalTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const offsetMins = -d.getTimezoneOffset(); // getTimezoneOffset returns inverse
  const sign = offsetMins >= 0 ? "+" : "-";
  const absH = Math.floor(Math.abs(offsetMins) / 60);
  const absM = Math.abs(offsetMins) % 60;
  const gmtOffset =
    absM === 0
      ? `GMT${sign}${absH}`
      : `GMT${sign}${absH}:${String(absM).padStart(2, "0")}`;

  return `${hh}:${mm}:${ss} ${gmtOffset}`;
}

function LocalClock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    // Defer the first tick out of the effect body (avoids a synchronous
    // setState cascade), then tick every second.
    const tick = () => setTime(formatLocalTime(new Date()));
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  // Avoid hydration mismatch — render nothing on first server pass
  if (time === null) return null;

  return (
    <span className="footer-clock" aria-label="Your local time" aria-live="off">
      {time}
    </span>
  );
}

export default function Footer() {
  const backToTop = () => {
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(0, { duration: 1.3, easing: power4InOut, force: true, lock: true });
    else gsap.to(window, { scrollTo: { y: 0 }, duration: 1.5, ease: "power4.inOut" });
  };

  return (
    <footer className="site-footer" id="footer">
      <div className="footer-row">
        <button type="button" className="footer-logo" onClick={backToTop} aria-label="Back to top">
          <span className="bracket">&#123;</span>A<span className="bracket">&#125;</span>
        </button>

        <span className="footer-status">
          <span className="footer-dot" aria-hidden="true" />
          available for backend engineering roles &amp; freelance work
        </span>

        <span className="footer-stack">
          <HoverScrambleText text="Django · DRF · PostgreSQL · Docker · AWS" />
        </span>
      </div>

      <div className="footer-sub">
        <span>© 2026 Abdus Sami</span>
        <LocalClock />
      </div>
    </footer>
  );
}
