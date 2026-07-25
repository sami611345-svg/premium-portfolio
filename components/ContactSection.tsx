"use client";

import React, { useRef, useState } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { RollingHeadline } from "./ui/RollingHeadline";
import { HoverScrambleText } from "./ui/HoverScrambleText";
import { PhoneIcon, MailIcon, DownloadIcon } from "./ui/icons";
import { burnControls } from "../lib/burnControls";
import { MOTION_FAILED_EVENT } from "../lib/motionEvents";
import {
  IMMERSIVE_SCROLL_MEDIA_QUERY,
  TOUCH_MEDIA_QUERY,
} from "../lib/mediaQueries";

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface ContactSectionProps {
  /** Pass preloaderDone so RollingHeadline waits for entry animation */
  animate?: boolean;
}

// Three reveal modes, selected by gsap.matchMedia:
//   · Desktop full-motion — burn-driven static reveal (see branch below).
//   · Mobile full-motion — an atmospheric shroud-lift reveal.
//   · Reduced motion — everything appears instantly.
export default function ContactSection({ animate = true }: ContactSectionProps) {
  // Section container — the ScrollTrigger trigger root
  const sectionRef = useRef<HTMLElement>(null);

  // Retained failure-contract surface; hidden in every current mode.
  const maskRef = useRef<HTMLDivElement>(null);

  // The button grid — animated by the mobile fade; static on desktop
  const buttonsRef = useRef<HTMLDivElement>(null);

  // State gates RollingHeadline until the active entrance reaches the heading.
  const [headlineReady, setHeadlineReady] = useState(false);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const mask = maskRef.current;
      const buttons = buttonsRef.current;

      if (!section || !mask || !buttons) return;
      const links = Array.from(
        buttons.querySelectorAll<HTMLElement>(".contact-link"),
      );
      const mm = gsap.matchMedia();

      try {
        // Reduced motion keeps the complete chapter and burn palette without
        // a sweeping mask or displacement.
        mm.add("(prefers-reduced-motion: reduce)", () => {
          gsap.set(mask, { display: "none", clearProps: "transform,willChange" });
          gsap.set([buttons, ...links], {
            opacity: 1,
            y: 0,
            filter: "none",
            clearProps: "willChange",
          });
          setHeadlineReady(true);
        });

      // Desktop: the burn IS the entrance. Contact sits fully formed beneath
      // the burning About sheet, so clearProps strips the JSX pre-paint state
      // (opacity 0 / translateY) and the ember front uncovers finished UI.
      // Only RollingHeadline keeps a cue, fired by the burn's midpoint signal.
        mm.add(IMMERSIVE_SCROLL_MEDIA_QUERY, () => {
          gsap.set(mask, { display: "none", clearProps: "transform,willChange" });
          gsap.set([buttons, ...links], {
            clearProps: "opacity,transform,filter,willChange",
          });

          const unsub = burnControls.onHeadline((forward) => setHeadlineReady(forward));
          return () => unsub();
        });

      // Mobile: main's shroud-lift reveal — the atmospheric mask slides
      // up off-screen as the section scrolls into view, physically
      // uncovering the button grid beneath it. No pinning/burn on
      // mobile, so this keeps the original lift entrance.
        mm.add(
          TOUCH_MEDIA_QUERY,
          () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              return;
            }

            // Initial state: mask fully covers content, buttons are hidden
            gsap.set(mask, {
              display: "block",
              yPercent: 0,
              clearProps: "willChange",
            });
            gsap.set(buttons, { opacity: 0, y: 30, clearProps: "filter" });

            // Build the master timeline scrubbed by scroll
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: section,
                start: "top bottom-=200px",
                end: "bottom bottom",
                scrub: 1,
              },
            });

            // Phase 1 (progress 0 → 0.65): Atmospheric shroud lifts upward.
            // yPercent: 0 → -100 moves the mask completely off-screen above,
            // physically revealing the contact grid beneath it.
            tl.to(
              mask,
              {
                yPercent: -100,
                ease: "power2.inOut",
                duration: 0.65,
              },
              0,
            );

            // Trigger the rolling headline when the sweep passes over the title
            tl.call(
              () => {
                const isForward = tl.scrollTrigger ? tl.scrollTrigger.direction === 1 : true;
                setHeadlineReady(isForward);
              },
              undefined,
              0.4,
            );

            // Phase 2 (progress 0.45 → 1.0): Buttons float up and become
            // visible, delayed so they start appearing after the mask has
            // lifted halfway.
            tl.to(
              buttons,
              {
                opacity: 1,
                y: 0,
                ease: "power3.out",
                duration: 0.55,
              },
              0.45,
            );

            return () => {
              tl.scrollTrigger?.kill();
              tl.kill();
              gsap.set(mask, {
                display: "none",
                clearProps: "transform,willChange",
              });
              gsap.set(buttons, {
                opacity: 1,
                y: 0,
                clearProps: "willChange",
              });
            };
          },
        );
      } catch {
        gsap.set(mask, { display: "none", clearProps: "transform,willChange" });
        gsap.set([buttons, ...links], {
          opacity: 1,
          y: 0,
          filter: "none",
          clearProps: "willChange",
        });
        setHeadlineReady(true);
        window.dispatchEvent(new CustomEvent(MOTION_FAILED_EVENT));
      }

      return () => mm.revert();
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      id="contact"
      className="contact-section"
      style={{
        position: "relative",
        minHeight: "100vh",
        backgroundColor: "var(--surface-0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* ── Contact content layer ─────────────────────────────────────────── */}
      <div
        className="container"
        style={{ position: "relative", zIndex: 1, width: "100%" }}
      >
        <div className="contact-inner">
          {/* Rolling Headline — scroll-triggered tumbler animation */}
          <RollingHeadline
            text="Get In Touch"
            className="contact-heading"
            animate={animate && headlineReady}
            manualTrigger={true}
          />

          {/* Sub-copy */}
          <p className="contact-text">
            I&apos;m available for backend engineering roles and freelance
            projects, building secure, scalable APIs and cloud-native systems.
            Whether you have a question, a project idea, or just want to
            connect, my inbox is open.
          </p>

          {/* Button grid — sequentially revealed by the secondary GSAP tween */}
          <div
            ref={buttonsRef}
            className="contact-links"
            style={{
              // Ensure initial paint state matches GSAP set() — prevents flash
              opacity: 0,
              transform: "translateY(30px)",
              willChange: "opacity, transform",
            }}
          >
            <a
              href="mailto:hsami3508@gmail.com"
              className="contact-link"
              id="contact-email-btn"
            >
              <MailIcon />
              <HoverScrambleText text="Let's Work Together" />
            </a>

            <a
              href="tel:+8801315186694"
              className="contact-link"
              id="contact-phone-btn"
            >
              <PhoneIcon />
              <HoverScrambleText text="Call: +880 1315 186694" />
            </a>

            <a
              href="/assets/Abdus_Sami_Resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-link"
              id="contact-resume-btn"
            >
              <DownloadIcon />
              <HoverScrambleText text="View Resume ↗" />
            </a>
          </div>
        </div>
      </div>

      {/* Retained failure-contract surface; every current mode keeps it hidden. */}
      <div
        ref={maskRef}
        className="contact-mask"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          backgroundColor: "var(--surface-0)",
          top: "-2px",
          bottom: "-2px",
          display: "none",
          borderBottom: "1px solid var(--border-subtle)",
          boxShadow: "0 20px 50px rgba(13, 11, 9, 0.5)",
        }}
      />
    </section>
  );
}
