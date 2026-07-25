"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import ScrollToPlugin from "gsap/ScrollToPlugin";
import ScrollTrigger from "gsap/ScrollTrigger";
import AboutSection from "../components/AboutSection";
import ContactSection from "../components/ContactSection";
import Footer from "../components/Footer";
import HeadlineReveal from "../components/HeadlineReveal";
import HeroSection from "../components/HeroSection";
import InViewMount from "../components/InViewMount";
import PipelineGrid from "../components/PipelineGrid";
import ScrollVelocitySkew from "../components/ScrollVelocitySkew";
import SpatialSection from "../components/SpatialSection";
import StackTransitions from "../components/StackTransitions";
import StickyDeckSection from "../components/StickyDeckSection";
import { HoverScrambleText } from "../components/ui/HoverScrambleText";
import { BUILDING } from "../lib/data";
import { burnControls } from "../lib/burnControls";
import { getLenis } from "../lib/lenisInstance";
import {
  resolveMotionEnvironment,
  subscribeMotionEnvironment,
  type MotionEnvironment,
} from "../lib/motionEnvironment";
import {
  getScrollTargetY,
  measureNavClearance,
  observeScrollTargets,
  power4InOut,
  refreshScrollTargets,
} from "../lib/scrollTarget";
import { trapFocus } from "../lib/trapFocus";
import { MOTION_FAILED_EVENT } from "../lib/motionEvents";

gsap.registerPlugin(ScrollToPlugin, ScrollTrigger);

const NAV_ITEMS = [
  { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
] as const;

const SKILL_PILLS = [
  "Python",
  "Django",
  "Django REST Framework",
  "REST APIs",
  "API Design",
  "JWT Authentication",
  "RBAC",
  "PostgreSQL",
  "Database Design",
  "SQL",
  "Docker",
  "Gunicorn",
  "NGINX",
  "AWS EC2",
  "DigitalOcean",
  "Linux",
  "System Design",
  "CI/CD",
  "Git",
  "GitHub",
] as const;

const CHAPTER_TARGETS = [
  "projects",
  "currently-building",
  "skills",
  "about",
  "contact",
] as const;

const FAILURE_CLEAR_TARGETS = [
  ".stack-section",
  ".cs-viewport",
  ".cs-slide",
  ".sp-content",
  ".sp-reveal",
  "[data-chapter-heading]",
  "[data-chapter-body]",
  "[data-building-card]",
  "[data-circuit-draw]",
  "[data-circuit-glow]",
  ".about-sticky",
  ".about-split-container",
  ".about-terminal-wrap",
  ".contact-sticky",
  ".contact-links",
  ".contact-link",
  ".contact-mask",
  ".stack-veil",
  ".reveal-word",
  ".name-part-1",
  ".name-part-2",
  ".hero-tagline",
  ".hero-sub",
  /* The coarse-pointer name-split scrub fades this container to 0 on
     exit; fail-open must restore it or the hero CTAs stay hidden. */
  ".hero-sub-content",
  ".hero-buttons",
].join(",");

const GravityPit = dynamic(() => import("../components/GravityPit"), {
  ssr: false,
});
const PreLoader = dynamic(() => import("../components/PreLoader"), {
  ssr: false,
});

export default function Home() {
  const [environment, setEnvironment] = useState<MotionEnvironment | null>(null);
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState("");
  const portfolioSectionRef = useRef<HTMLElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const navigationActiveRef = useRef(false);
  const motionFailedRef = useRef(false);
  const desktopScrub = environment?.desktopScrub ?? false;

  const failOpen = useCallback(() => {
    if (motionFailedRef.current) return;
    motionFailedRef.current = true;
    const root = document.documentElement;
    root.dataset.motionReady = "failed";
    delete root.dataset.burnActive;

    try {
      burnControls.setActive(false);
      burnControls.setProgress(0);
      burnControls.invalidate();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      gsap.killTweensOf(FAILURE_CLEAR_TARGETS);
      gsap.set(FAILURE_CLEAR_TARGETS, {
        clearProps:
          "opacity,transform,filter,clipPath,visibility,pointerEvents,willChange,strokeDasharray,strokeDashoffset",
      });
    } catch {
      // The CSS failure contract still exposes the complete natural-flow page.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motionReady = "false";

    const onMotionFailure = () => failOpen();
    window.addEventListener(MOTION_FAILED_EVENT, onMotionFailure);

    const unsubscribe = subscribeMotionEnvironment(setEnvironment, {
      debounceAll: true,
      watchOrientation: true,
    });

    return () => {
      unsubscribe();
      window.removeEventListener(MOTION_FAILED_EVENT, onMotionFailure);
      delete root.dataset.motionReady;
      root.style.removeProperty("--nav-clearance");
    };
  }, [failOpen]);

  /* No-WebGL desktop: the immersive media query still matches, but the
     laptop scrub — the only thing that reveals #projects at desktop
     widths — can never mount. Fail open immediately so the natural-flow
     contract (poster hero, everything visible) takes over instead of the
     pinned runways activating around content nothing will ever reveal. */
  useEffect(() => {
    if (!environment || !environment.desktopScrub || environment.webglAvailable) {
      return;
    }
    /* Confirm before failing open: a cold GPU process can make the very
       first WebGL probe fail transiently (seen under e2e load), and
       fail-open latches permanently. Re-probe after a beat and only
       dispatch if WebGL is genuinely unavailable. Dispatch (rather than
       call failOpen directly) so every component's own listener also
       runs — StickyDeckSection's exposeStaticDeck is what clears
       #projects' inline hidden state. */
    const timer = window.setTimeout(() => {
      const recheck = resolveMotionEnvironment();
      if (recheck.desktopScrub && !recheck.webglAvailable) {
        window.dispatchEvent(new Event(MOTION_FAILED_EVENT));
      }
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [environment]);

  useEffect(() => {
    const root = document.documentElement;
    const nav = document.getElementById("navbar");
    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty(
          "--nav-clearance",
          `${measureNavClearance(nav)}px`,
        );
      });
    };

    const observer =
      nav && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (nav) observer?.observe(nav);
    window.addEventListener("resize", measure, { passive: true });
    void document.fonts?.ready.then(measure).catch(() => undefined);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const refreshTargets = () => {
      getLenis()?.resize();
      refreshScrollTargets(CHAPTER_TARGETS);
    };
    const stopObserving = observeScrollTargets();

    ScrollTrigger.addEventListener("refresh", refreshTargets);
    window.addEventListener("load", refreshTargets);
    window.addEventListener("orientationchange", refreshTargets);
    refreshTargets();

    return () => {
      ScrollTrigger.removeEventListener("refresh", refreshTargets);
      window.removeEventListener("load", refreshTargets);
      window.removeEventListener("orientationchange", refreshTargets);
      stopObserving();
    };
  }, []);

  useEffect(() => {
    if (!environment || !preloaderDone || motionFailedRef.current) return;

    let firstFrame = 0;

    try {
      firstFrame = requestAnimationFrame(() => {
        if (motionFailedRef.current) return;
        document.documentElement.dataset.motionReady = "true";
        /* Force the named runway styles to resolve before either Lenis or
           ScrollTrigger snapshots the new document height. */
        void document.documentElement.scrollHeight;
        getLenis()?.resize();
        ScrollTrigger.refresh();
        refreshScrollTargets(CHAPTER_TARGETS);
      });
    } catch {
      failOpen();
    }

    return () => {
      cancelAnimationFrame(firstFrame);
    };
  }, [environment, failOpen, preloaderDone]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const menu = mobileMenuRef.current;
    const toggle = mobileToggleRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const lenis = getLenis();
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    lenis?.stop();

    const focusMenuEntry = () => {
      if (menu?.getAttribute("aria-hidden") === "false") {
        mobileMenuCloseRef.current?.focus({ preventScroll: true });
      }
    };

    focusMenuEntry();
    let focusFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        focusMenuEntry();
      });
    });
    const focusTimer = window.setTimeout(focusMenuEntry, 450);
    const onMenuTransitionEnd = (event: TransitionEvent) => {
      if (event.target === menu && (event.propertyName === "opacity" || event.propertyName === "transform")) {
        focusMenuEntry();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMenuOpen(false);
      }
    };

    const releaseFocusTrap = menu ? trapFocus(menu) : () => undefined;
    menu?.addEventListener("transitionend", onMenuTransitionEnd);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.clearTimeout(focusTimer);
      menu?.removeEventListener("transitionend", onMenuTransitionEnd);
      document.removeEventListener("keydown", onKeyDown);
      releaseFocusTrap();
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      lenis?.start();
      (previousFocus ?? toggle)?.focus({ preventScroll: true });
    };
  }, [isMenuOpen]);

  const cancelNavigation = useCallback(() => {
    if (!navigationActiveRef.current) return;
    navigationActiveRef.current = false;
    const lenis = getLenis();
    lenis?.scrollTo(window.scrollY, {
      immediate: true,
      force: true,
      lock: false,
    });
    gsap.killTweensOf(window);
  }, []);

  useEffect(() => {
    const pointerOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      ) {
        cancelNavigation();
      }
    };

    window.addEventListener("wheel", cancelNavigation, pointerOptions);
    window.addEventListener("touchstart", cancelNavigation, pointerOptions);
    window.addEventListener("pointerdown", cancelNavigation, pointerOptions);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("wheel", cancelNavigation, true);
      window.removeEventListener("touchstart", cancelNavigation, true);
      window.removeEventListener("pointerdown", cancelNavigation, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [cancelNavigation]);

  const sectionTargetY = useCallback((id: string): number | null => {
    getLenis()?.resize();
    const snapshot = refreshScrollTargets([id]);
    return snapshot.targets.get(id)?.landingY ?? getScrollTargetY(id, "landing");
  }, []);

  const travelTo = useCallback(
    (targetY: number, immediate: boolean) => {
      cancelNavigation();
      const y = Math.max(0, targetY);
      const lenis = getLenis();
      lenis?.resize();

      if (immediate || environment?.reducedMotion) {
        if (lenis) {
          lenis.scrollTo(y, { immediate: true, force: true, lock: false });
        } else {
          window.scrollTo({ top: y, behavior: "auto" });
        }
        return;
      }

      navigationActiveRef.current = true;
      if (lenis) {
        lenis.scrollTo(y, {
          duration: 1.3,
          easing: power4InOut,
          force: true,
          lock: false,
          onComplete: () => {
            navigationActiveRef.current = false;
          },
        });
      } else {
        window.scrollTo({ top: y, behavior: "smooth" });
        window.setTimeout(() => {
          navigationActiveRef.current = false;
        }, 1400);
      }
    },
    [cancelNavigation, environment?.reducedMotion],
  );

  const goToSection = useCallback(
    (event: ReactMouseEvent<HTMLElement>, id: string) => {
      event.preventDefault();
      const target = sectionTargetY(id);
      if (target == null) return;
      const immediate = event.detail === 0;
      const execute = () => travelTo(target, immediate);

      if (isMenuOpen) {
        setIsMenuOpen(false);
        requestAnimationFrame(() => requestAnimationFrame(execute));
      } else {
        execute();
      }
    },
    [isMenuOpen, sectionTargetY, travelTo],
  );

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY + 1;
        let current = "";

        for (const item of NAV_ITEMS) {
          const threshold = getScrollTargetY(item.id, "spy");
          if (threshold != null && y >= threshold) current = item.id;
        }

        if (
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 4
        ) {
          current = "contact";
        }
        setActiveId(current);
      });
    };

    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection, { passive: true });
    updateActiveSection();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [environment]);

  return (
    <>
      <PreLoader onComplete={() => setPreloaderDone(true)} />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <nav
        className="nav"
        id="navbar"
        aria-label="Primary navigation"
        inert={isMenuOpen}
      >
        <div className="nav-inner">
          <a
            href="#hero"
            className="nav-logo"
            id="nav-logo"
            onClick={(event) => {
              event.preventDefault();
              travelTo(0, event.detail === 0);
            }}
          >
            <span className="bracket">&#123;</span>J
            <span className="bracket">&#125;</span>
          </a>

          <ul className="nav-links">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={activeId === item.id ? "is-active" : ""}
                  aria-current={activeId === item.id ? "page" : undefined}
                  onClick={(event) => goToSection(event, item.id)}
                >
                  <HoverScrambleText text={item.label} />
                </a>
              </li>
            ))}
          </ul>

          <a
            href="/assets/Abdus_Sami_Resume.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-resume"
            id="nav-resume-btn"
          >
            <HoverScrambleText text="Resume" />
            <span className="nav-resume-arrow" aria-hidden="true">
              ↗
            </span>
          </a>

          <button
            ref={mobileToggleRef}
            className="mobile-toggle"
            id="mobile-toggle"
            type="button"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        </div>
      </nav>

      <div
        ref={mobileMenuRef}
        className={`mobile-menu${isMenuOpen ? " open" : ""}`}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!isMenuOpen}
        inert={!isMenuOpen}
      >
        <button
          ref={mobileMenuCloseRef}
          className="mobile-menu-close"
          type="button"
          aria-label="Close menu"
          onClick={() => setIsMenuOpen(false)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>

        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={activeId === item.id ? "is-active" : ""}
            aria-current={activeId === item.id ? "page" : undefined}
            onClick={(event) => goToSection(event, item.id)}
          >
            {item.label}
          </a>
        ))}

        <a
          href="/assets/Abdus_Sami_Resume.pdf"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setIsMenuOpen(false)}
        >
          Resume ↗
        </a>
      </div>

      <main id="main-content" tabIndex={-1} inert={isMenuOpen}>
        <HeroSection
          animate={preloaderDone}
          environment={environment ?? undefined}
          motionEnabled={desktopScrub}
          portfolioSectionRef={portfolioSectionRef}
        />

        <div className="stack-section" data-stack>
          <StickyDeckSection
            portfolioSectionRef={portfolioSectionRef}
            motionEnabled={desktopScrub}
          />
        </div>

        <div
          className="stack-section stack-section--building"
          data-stack
          style={{ zIndex: 2 }}
        >
          <SpatialSection id="currently-building" chapter="building">
            <div className="container">
              <header
                className="ed-header"
                data-chapter-heading
                style={{ marginBottom: "56px" }}
              >
                <div className="ed-header-row sp-reveal">
                  <span className="ed-eyebrow">02 / In Progress</span>
                  <span className="ed-meta mono">live pipelines</span>
                </div>
                <h2 className="ed-heading ed-heading--md sp-reveal">
                  Currently <em>building</em>
                </h2>
              </header>
              <PipelineGrid items={BUILDING} />
            </div>
          </SpatialSection>
          <div className="stack-veil" aria-hidden="true" />
        </div>

        <div
          className="stack-section stack-section--skills"
          data-stack
          style={{ zIndex: 3 }}
        >
          <SpatialSection
            id="skills"
            chapter="skills"
            className="skills-spatial"
          >
            <div className="container">
              <header
                className="ed-header"
                data-chapter-heading
                style={{ marginBottom: "20px" }}
              >
                <div className="ed-header-row sp-reveal">
                  <span className="ed-eyebrow">03 / Skills</span>
                  <span className="ed-meta mono">drag to interact</span>
                </div>
                <h2 className="ed-heading ed-heading--md sp-reveal">
                  The <em>stack</em>
                </h2>
              </header>

              <p
                className="sp-reveal"
                style={{
                  color: "var(--ink-2)",
                  marginBottom: "20px",
                  fontFamily: "var(--font-jakarta)",
                  fontSize: "15px",
                  letterSpacing: "-0.01em",
                }}
              >
                Technologies and frameworks I use to engineer robust, scalable
                systems.
              </p>

              <div className="sp-reveal" data-chapter-body>
                {environment === null ? null : (
                  <InViewMount minHeight={420}>
                    <GravityPit pills={SKILL_PILLS} />
                  </InViewMount>
                )}
              </div>
            </div>
          </SpatialSection>
          <div className="stack-veil" aria-hidden="true" />
        </div>

        <div
          className="stack-section stack-section--about"
          data-stack
          style={{ zIndex: 6 }}
        >
          <AboutSection />
          <div className="stack-veil" aria-hidden="true" />
        </div>

        <div
          className="stack-section contact-runway"
          data-stack
          style={{ zIndex: 5 }}
        >
          <div
            className="chapter-marker chapter-marker--contact-spy"
            data-scroll-spy="contact"
            data-scroll-spy-clearance="none"
            aria-hidden="true"
          />
          <div
            className="chapter-marker chapter-marker--contact-landing"
            data-scroll-landing="contact"
            data-scroll-landing-clearance="none"
            aria-hidden="true"
          />
          <div className="contact-sticky">
            <ContactSection animate={preloaderDone} />
          </div>
          <div className="stack-veil" aria-hidden="true" />
        </div>
      </main>

      <Footer />
      <StackTransitions />
      <HeadlineReveal />
      <ScrollVelocitySkew />
    </>
  );
}
