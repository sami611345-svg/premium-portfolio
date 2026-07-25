"use client";

import React, { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import TerminalBlock from "./TerminalBlock";
import ScrollScrambleText from "./ScrollScrambleText";
import { MOTION_FAILED_EVENT } from "../lib/motionEvents";
import {
  IMMERSIVE_SCROLL_MEDIA_QUERY,
  TOUCH_MEDIA_QUERY,
} from "../lib/mediaQueries";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Bio paragraphs — JSX fragments so specific words can be bolded
// while BioWords still splits the rest at the word level.
const BIO_PARAGRAPHS = [
  <>
    I&apos;m a backend developer specializing in <strong>Python</strong>, <strong>Django</strong>,{" "}
    <strong>Django REST Framework</strong>, and <strong>PostgreSQL</strong>, with practical experience
    building production-ready backend systems that solve real problems.
  </>,
  <>
    As a <strong>freelance backend developer</strong>, I build secure REST APIs with JWT authentication
    and role-based access control, design relational PostgreSQL databases, and deploy applications on
    Linux servers using <strong>Docker</strong>, <strong>Gunicorn</strong>, and <strong>NGINX</strong>.
  </>,
  <>
    <strong>BSc in Computer Science &amp; Engineering</strong>, Daffodil International University (CGPA 3.80).
    I enjoy building scalable backend architectures and clean APIs following industry best practices.
  </>,
];

export default function AboutSection() {
  const runwayRef = useRef<HTMLElement>(null);
  const textColRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const runway = runwayRef.current;
    if (!runway) return;

    const mm = gsap.matchMedia();

    try {
      mm.add(IMMERSIVE_SCROLL_MEDIA_QUERY, () => {
      const words = textColRef.current
        ? Array.from(textColRef.current.querySelectorAll<HTMLElement>(".reveal-word"))
        : [];

      // Word-by-word color scrub. end is an explicit +=80% of one
      // viewport (not "bottom bottom") so words finish early in the
      // runway regardless of its full height (which exists for the
      // burn tail).
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: runway,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * 0.8)}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });

      if (words.length > 0) {
        tl.to(
          words,
          {
            color: "rgba(228, 222, 207, 1)",
            ease: "none",
            stagger: {
              each: 0.04,
              from: "start",
            },
          },
          0
        );
      }

      /* ---- Terminal: scrubbed slide-in (reverses on scroll-back) ---- */
      if (terminalRef.current) {
        tl.fromTo(
          terminalRef.current,
          { y: 150, opacity: 0 },
          { y: 0, opacity: 1, duration: 2.0, ease: "power3.out" },
          0
        );
      }
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        const words = textColRef.current
          ? Array.from(textColRef.current.querySelectorAll<HTMLElement>(".reveal-word"))
          : [];
        gsap.set(words, { color: "rgba(228, 222, 207, 1)" });
        gsap.set(terminalRef.current, { opacity: 1, y: 0, clearProps: "filter" });
      });

      mm.add(TOUCH_MEDIA_QUERY, () => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        /* Words are immediately visible; terminal fades in once */
        if (textColRef.current) {
          const words = Array.from(textColRef.current.querySelectorAll<HTMLElement>(".reveal-word"));
          gsap.set(words, { color: "rgba(228, 222, 207, 1)" });
        }
        if (terminalRef.current) {
          gsap.set(terminalRef.current, { opacity: 0 });
          ScrollTrigger.create({
            trigger: runway,
            start: "top 75%",
            once: true,
            onEnter: () => {
              gsap.to(terminalRef.current, { opacity: 1, duration: 0.4, ease: "power1.out" });
            },
          });
        }
      });
    } catch {
      const words = textColRef.current
        ? Array.from(textColRef.current.querySelectorAll<HTMLElement>(".reveal-word"))
        : [];
      gsap.set(words, { color: "rgba(228, 222, 207, 1)" });
      gsap.set(terminalRef.current, { opacity: 1, y: 0, clearProps: "filter" });
      window.dispatchEvent(new CustomEvent(MOTION_FAILED_EVENT));
    }

    return () => mm.revert();
  }, { scope: runwayRef });

  return (
    <section
      ref={runwayRef}
      className="about-runway"
      style={{ position: "relative" }}
    >
      {/* Anchor target placed halfway down the runway so text is mostly revealed */}
      <div
        className="chapter-marker chapter-marker--spy"
        data-scroll-spy="about"
        data-scroll-spy-clearance="none"
        aria-hidden="true"
      />
      <div
        id="about"
        className="chapter-marker chapter-marker--about-landing"
        data-scroll-landing="about"
        data-scroll-landing-clearance="none"
        aria-hidden="true"
      />
      <div className="about-sticky">
        {/* ---- Inner layout: two columns on desktop ---- */}
        <div className="about-split-container">

          {/* ===== LEFT: Section header + bio ===== */}
          <div ref={textColRef} className="about-split-text">
            {/* Section header — editorial display heading */}
            <header className="ed-header" style={{ marginBottom: "13px" }}>
              <div className="ed-header-row" style={{ marginBottom: "0px", paddingBottom: "4px" }}>
                <span className="ed-eyebrow">04 / Profile</span>
              </div>
              <h2 className="ed-heading ed-heading--md">
                <ScrollScrambleText segments={[{ text: "About " }, { text: "me", em: true }]} />
              </h2>
            </header>

            {/* Bio paragraphs — each word is individually animatable;
                the first paragraph reads as an oversized editorial lede */}
            <div className="about-bio" data-skew>
              {BIO_PARAGRAPHS.map((para, idx) => (
                <p
                  key={idx}
                  className={idx === 0 ? "about-bio-para about-bio-para--lede" : "about-bio-para"}
                >
                  <BioWords node={para} />
                </p>
              ))}
            </div>
          </div>

          {/* ===== RIGHT: Animated terminal cage ===== */}
          <div ref={terminalRef} className="about-terminal-wrap">
            <TerminalBlock />
          </div>

        </div>
      </div>
    </section>
  );
}

// BioWords — wraps every text-word in a .reveal-word <span>,
// leaving <strong> nodes and entities intact.
type ReactChild = React.ReactNode;

function BioWords({ node }: { node: ReactChild }): React.ReactElement {
  if (typeof node === "string") {
    const tokens = node.split(/(\s+)/);
    return (
      <>
        {tokens.map((token, i) =>
          /^\s+$/.test(token) ? (
            <React.Fragment key={i}>{token}</React.Fragment>
          ) : token === "" ? null : (
            <span className="reveal-word" key={i}>
              {token}
            </span>
          )
        )}
      </>
    );
  }

  if (typeof node === "number" || typeof node === "boolean") {
    return <>{node}</>;
  }

  if (node === null || node === undefined) {
    return <></>;
  }

  if (Array.isArray(node)) {
    return (
      <>
        {node.map((child, i) => (
          <BioWords key={i} node={child} />
        ))}
      </>
    );
  }

  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: ReactChild }>;
    const { children, ...rest } = el.props as { children?: ReactChild;[key: string]: unknown };
    return React.cloneElement(el, rest as Record<string, unknown>, <BioWords node={children} />);
  }

  return <>{node}</>;
}
