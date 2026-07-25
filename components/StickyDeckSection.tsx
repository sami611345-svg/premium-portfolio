"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import Image from "next/image";
import { FEATURED_PROJECTS, SECONDARY_PROJECTS } from "../lib/data";
import { ArrowUpRightIcon } from "./ui/icons";
import { CometCard } from "@/components/ui/comet-card";
import { HoverScrambleText } from "./ui/HoverScrambleText";
import { getLenis } from "../lib/lenisInstance";
import { PROJECT_PHASES } from "../lib/chapterPhases";
import { IMMERSIVE_SCROLL_MEDIA_QUERY } from "../lib/mediaQueries";
import { trapFocus } from "../lib/trapFocus";
import { MOTION_FAILED_EVENT } from "../lib/motionEvents";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/* ─── Accent hues per project ─────────────────────────────────────── */
const CARD_HUES: Record<string, string> = {
  "ecommerce-backend":  "38, 56%, 52%",   /* gold  (01) */
  "fundraising-system": "209, 34%, 64%",  /* blue  (02) */
  "greenery-cms":       "44, 60%, 56%",   /* gold  (03) */
};

const N = FEATURED_PROJECTS.length;
const pad = (n: number) => String(n).padStart(2, "0");
const hueOf = (id: string) => CARD_HUES[id] ?? "188, 45%, 52%";

/* Each project gets an intentional reading beat. The two narrow ranges are
   the only places where slides crossfade; rail jumps target the centre of a
   hold, never the sticky track's release boundary. */
const PROJECT_HOLDS = PROJECT_PHASES.holds;
if (
  process.env.NODE_ENV !== "production" &&
  PROJECT_HOLDS.length !== FEATURED_PROJECTS.length
) {
  throw new Error("PROJECT_PHASES.holds must match FEATURED_PROJECTS length");
}

const projectPositionAt = (progress: number) => {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= PROJECT_HOLDS[0].end) return 0;
  if (p < PROJECT_HOLDS[1].start) {
    return (p - PROJECT_HOLDS[0].end) /
      (PROJECT_HOLDS[1].start - PROJECT_HOLDS[0].end);
  }
  if (p <= PROJECT_HOLDS[1].end) return 1;
  if (p < PROJECT_HOLDS[2].start) {
    return 1 + (p - PROJECT_HOLDS[1].end) /
      (PROJECT_HOLDS[2].start - PROJECT_HOLDS[1].end);
  }
  return 2;
};

/* power4.inOut — mirrors the {J} logo's scroll-to feel for click jumps */
const power4InOut = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

type Project = (typeof FEATURED_PROJECTS)[number];

interface LightboxState {
  images: string[];
  alts: string[];
  title: string;
  hue: string;
  start: number;
}

/* ═══════════════════════════════════════════════════════════════════
   LIGHTBOX — enlarged image viewer

   Portalled to document.body: a position:fixed overlay rendered in-tree
   would anchor to the transformed .stack-section, not the viewport.
   Pauses Lenis while open and restores focus to the trigger on close.
   ═══════════════════════════════════════════════════════════════════ */
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

function Lightbox({ images, alts, title, hue, start, onClose }: LightboxState & { onClose: () => void }) {
  const [i, setI] = useState(start);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const multi = images.length > 1;

  /* ── Zoom / pan ──────────────────────────────────────────────────
     Wide architecture diagrams (up to 7.2:1) fit the 92vw box at only
     ~50px tall on a phone — unreadable without magnification. Pointer
     Events cover mouse drag and two-finger pinch with one code path,
     so there's no library and no touch/mouse branch. */
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [animateZoom, setAnimateZoom] = useState(false);
  const [dragging, setDragging] = useState(false);
  const zoomed = zoom.scale > 1.001;
  /* Mirrors `zoom` for the pointer handlers, which need the live value
     without re-subscribing. Synced in an effect (never during render);
     effects flush before any user event, so handlers never read stale. */
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  /* Live pointers, plus gesture bookkeeping that must not trigger
     re-renders mid-drag. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ dist: number; scale: number; x: number; y: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastTapRef = useRef(0);
  /* Chromium synthesizes a dblclick from a double-TAP as well as from a
     mouse double-click, so the native handler and the tap detector below
     would both fire on touch and cancel each other out. This records the
     device that started the gesture so exactly one path ever runs. */
  const lastPointerTypeRef = useRef<string>("mouse");

  /* Keep the image overlapping the stage: at scale s the image can move
     at most (s-1)/2 of its rendered size before an edge crosses centre. */
  const clamp = useCallback((scale: number, x: number, y: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x, y };
    const maxX = Math.max(0, (rect.width * scale - rect.width) / 2);
    const maxY = Math.max(0, (rect.height * scale - rect.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  const resetZoom = useCallback((animate = true) => {
    setAnimateZoom(animate);
    setZoom({ scale: 1, x: 0, y: 0 });
  }, []);

  const applyZoom = useCallback(
    (nextScale: number, originX = 0, originY = 0) => {
      const scale = Math.min(MAX_ZOOM, Math.max(1, nextScale));
      if (scale <= 1.001) {
        setZoom({ scale: 1, x: 0, y: 0 });
        return;
      }
      setZoom(() => ({ scale, ...clamp(scale, originX, originY) }));
    },
    [clamp],
  );

  /* Double click/tap toggles between fit and DOUBLE_TAP_ZOOM, anchored
     on the pointer so you magnify what you aimed at. */
  const toggleZoomAt = useCallback(
    (clientX: number, clientY: number) => {
      setAnimateZoom(true);
      if (zoomRef.current.scale > 1.001) {
        setZoom({ scale: 1, x: 0, y: 0 });
        return;
      }
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = rect.left + rect.width / 2 - clientX;
      const dy = rect.top + rect.height / 2 - clientY;
      const scale = DOUBLE_TAP_ZOOM;
      setZoom({ scale, ...clamp(scale, dx * (scale - 1), dy * (scale - 1)) });
    },
    [clamp],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const pointers = pointersRef.current;
      lastPointerTypeRef.current = event.pointerType;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gestureRef.current = {
          dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
          scale: zoomRef.current.scale,
          x: zoomRef.current.x,
          y: zoomRef.current.y,
        };
        panRef.current = null;
        return;
      }

      if (pointers.size === 1) {
        /* Touch only: mice get native onDoubleClick. Running both paths
           for a mouse fires two toggles per double-click — zoom in, then
           straight back out. */
        if (event.pointerType !== "mouse") {
          const now = Date.now();
          if (now - lastTapRef.current < 300) {
            lastTapRef.current = 0;
            toggleZoomAt(event.clientX, event.clientY);
            return;
          }
          lastTapRef.current = now;
        }
        if (zoomRef.current.scale > 1.001) {
          setAnimateZoom(false);
          setDragging(true);
          panRef.current = {
            x: event.clientX,
            y: event.clientY,
            ox: zoomRef.current.x,
            oy: zoomRef.current.y,
          };
          (event.target as Element).setPointerCapture?.(event.pointerId);
        }
      }
    },
    [toggleZoomAt],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const pointers = pointersRef.current;
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const gesture = gestureRef.current;
      if (pointers.size === 2 && gesture) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        setAnimateZoom(false);
        applyZoom((dist / gesture.dist) * gesture.scale, gesture.x, gesture.y);
        return;
      }

      const pan = panRef.current;
      if (pan && pointers.size === 1) {
        const scale = zoomRef.current.scale;
        setZoom({
          scale,
          ...clamp(scale, pan.ox + (event.clientX - pan.x), pan.oy + (event.clientY - pan.y)),
        });
      }
    },
    [applyZoom, clamp],
  );

  const endPointer = useCallback((event: React.PointerEvent) => {
    const pointers = pointersRef.current;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) gestureRef.current = null;
    if (pointers.size === 0) {
      panRef.current = null;
      setDragging(false);
    }
  }, []);

  /* Ctrl/⌘ + wheel zoom. A native non-passive listener, NOT React's
     onWheel: React ≥17 delegates wheel through a PASSIVE root listener,
     so preventDefault() there is a no-op (console warning) and the
     browser's own ctrl+wheel page-zoom fires alongside the image zoom. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setAnimateZoom(false);
      const next = zoomRef.current.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12);
      applyZoom(next, zoomRef.current.x, zoomRef.current.y);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  /* Changing image always returns to fit — carrying a pan offset onto a
     differently-shaped image would land you somewhere arbitrary. */
  const prev = useCallback(() => {
    resetZoom(false);
    setI((v) => (v - 1 + images.length) % images.length);
  }, [images.length, resetZoom]);
  const next = useCallback(() => {
    resetZoom(false);
    setI((v) => (v + 1) % images.length);
  }, [images.length, resetZoom]);


  useEffect(() => {
    const lenis = getLenis();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lenis?.stop();
    closeButtonRef.current?.focus();
    const dialog = dialogRef.current;
    const releaseFocusTrap = dialog
      ? trapFocus(dialog, { fallbackFocus: dialog })
      : () => undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        /* Esc unwinds one level: zoomed → fit, then fit → closed. */
        if (zoomRef.current.scale > 1.001) {
          resetZoom();
          return;
        }
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && multi) {
        event.preventDefault();
        prev();
        return;
      }
      if (event.key === "ArrowRight" && multi) {
        event.preventDefault();
        next();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      releaseFocusTrap();
      document.body.style.overflow = previousBodyOverflow;
      lenis?.start();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [multi, next, onClose, prev, resetZoom]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="cs-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} screenshots`}
      tabIndex={-1}
      /* While zoomed the backdrop must not dismiss: a pan that ends
         outside the image would otherwise close the viewer. */
      onClick={() => {
        if (zoomRef.current.scale > 1.001) return;
        onClose();
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="cs-lightbox-close"
        aria-label="Close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
      <div
        ref={stageRef}
        className={`cs-lightbox-stage${zoomed ? " is-zoomed" : ""}${dragging ? " is-dragging" : ""}`}
        style={{ "--card-hue": hue } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          /* Touch already zoomed via the tap detector in onPointerDown;
             acting on the synthesized dblclick too would undo it. */
          if (lastPointerTypeRef.current !== "mouse") return;
          toggleZoomAt(e.clientX, e.clientY);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {/* quality 95: these are technical result images (detection grids,
            curves) where visible compression artifacts would undercut them.
            width/height are nominal — .cs-lightbox-img CSS (auto + max
            constraints) controls layout from the real intrinsic ratio. */}
        <Image
          className="cs-lightbox-img"
          src={images[i]}
          alt={alts[i] ?? title}
          width={2400}
          height={1500}
          quality={95}
          sizes="92vw"
          draggable={false}
          style={{
            transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
            transition: animateZoom ? "transform 0.28s var(--ease-out-expo)" : "none",
          }}
        />

        {multi && (
          <>
            <button className="cs-lightbox-arrow cs-lightbox-prev" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); prev(); }}>‹</button>
            <button className="cs-lightbox-arrow cs-lightbox-next" aria-label="Next image" onClick={(e) => { e.stopPropagation(); next(); }}>›</button>
          </>
        )}

        <div className="cs-lightbox-caption mono">{alts[i] ?? title}</div>

        {multi && (
          <div className="cs-lightbox-dots">
            {images.map((_, d) => (
              <button
                key={d}
                className={`cs-dot${d === i ? " is-active" : ""}`}
                aria-label={`Image ${d + 1}`}
                aria-current={d === i}
                /* Same contract as prev/next: changing image returns to
                   fit — a pan offset carried onto a differently-shaped
                   image lands somewhere arbitrary. */
                onClick={(e) => { e.stopPropagation(); resetZoom(false); setI(d); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROJECT VISUAL — image carousel + caption (image-based projects)

   Holds the carousel index so the under-image caption (imageAlts[cur])
   and the crossfading images stay in lock-step. The image body opens
   the lightbox; arrows/dots are siblings (not nested in the clickable)
   and stopPropagation so they never trigger it.
   ═══════════════════════════════════════════════════════════════════ */
function ProjectVisual({ project, hue, priority, eager, onOpen }: {
  project: Project;
  hue: string;
  priority: boolean;
  eager: boolean;
  onOpen: (start: number) => void;
}) {
  const images = (project.images ?? []) as readonly string[];
  const alts = (project.imageAlts ?? []) as readonly string[];
  const [cur, setCur] = useState(0);
  const multi = images.length > 1;

  /* Once an image has been shown, keep it mounted — prevents unmount/
     refetch flashes when navigating back after the ±1 window moves on.
     State (not a ref) because render reads it — react-hooks/refs forbids
     reading ref.current during render. Updated via the React-docs
     "adjust state during render" pattern (guarded by tracked prev
     cur/eager) rather than an effect, since react-hooks/set-state-in-effect
     forbids unconditional setState inside a useEffect body. */
  const [shown, setShown] = useState<Set<number>>(() => new Set([0]));
  const [trackedCur, setTrackedCur] = useState(cur);
  const [trackedEager, setTrackedEager] = useState(eager);
  if (cur !== trackedCur || eager !== trackedEager) {
    setTrackedCur(cur);
    setTrackedEager(eager);
    const lo = Math.max(0, cur - 1);
    const hi = Math.min(images.length - 1, cur + 1);
    const toAdd = eager ? [cur, lo, hi] : [cur];
    if (!toAdd.every((i) => shown.has(i))) {
      const next = new Set(shown);
      toAdd.forEach((i) => next.add(i));
      setShown(next);
    }
  }

  const prev = () => setCur((v) => (v - 1 + images.length) % images.length);
  const next = () => setCur((v) => (v + 1) % images.length);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(cur); }
    else if (multi && e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (multi && e.key === "ArrowRight") { e.preventDefault(); next(); }
  };



  return (
    <div className="cs-visual-col">
      <CometCard rotateDepth={10} translateDepth={6}>
        <div className="cs-visual" style={{ "--card-hue": hue } as React.CSSProperties}>
          <div className="sd-card-accent" aria-hidden="true" />

          {/* Clickable image surface (role=button) — arrows/dots sit outside it */}
          <div
            className="cs-imgwrap"
            role="button"
            tabIndex={0}
            data-cursor-ignore
            aria-label={`Enlarge ${project.title} screenshot`}
            onClick={() => onOpen(cur)}
            onKeyDown={onKey}
          >
            {images.map((src, idx) => {
              const show =
                idx === 0 ||
                (eager && Math.abs(idx - cur) <= 1) ||
                shown.has(idx);
              return (
                <div
                  key={src}
                  className={`cs-img-slide${idx === cur ? " is-cur" : ""}`}
                  aria-hidden={idx !== cur}
                >
                  {show && (
                    <Image
                      src={src}
                      alt={alts[idx] ?? project.title}
                      fill
                      sizes="(max-width: 900px) 100vw, 55vw"
                      className="sd-img"
                      priority={priority && idx === 0}
                    />
                  )}
                </div>
              );
            })}
            <div className="sd-img-vignette" aria-hidden="true" />
          </div>

          {multi && (
            <>
              <button type="button" className="cs-arrow cs-arrow-prev" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); prev(); }}>‹</button>
              <button type="button" className="cs-arrow cs-arrow-next" aria-label="Next image" onClick={(e) => { e.stopPropagation(); next(); }}>›</button>
              <div className="cs-dots">
                {images.map((_, d) => (
                  <button
                    key={d}
                    type="button"
                    className={`cs-dot${d === cur ? " is-active" : ""}`}
                    aria-label={`Show image ${d + 1}`}
                    aria-current={d === cur}
                    onClick={(e) => { e.stopPropagation(); setCur(d); }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </CometCard>

      {/* The descriptive caption stays with the current image. The lead
          outcome metric belongs in the copy hierarchy beside the visual. */}
      <div className="cs-caption mono">
        <span className="cs-caption-alt">{alts[cur] ?? project.title}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PROJECT SLIDE — one case-study card (visual column + copy column)
   ═══════════════════════════════════════════════════════════════════ */
function ProjectSlide({ project, index, hue, eager, active, scrubActive, onOpen }: {
  project: Project;
  index: number;
  hue: string;
  eager: boolean;
  active: boolean;
  scrubActive: boolean;
  onOpen: (start: number) => void;
}) {
  const tags = project.tags as readonly string[];
  const metric = (project as { metric?: string }).metric ?? tags[0];
  const note = (project as { note?: string }).note;
  const hasImage = "images" in project && project.images && project.images.length > 0;
  const pipeline = (project as { pipeline?: readonly string[] }).pipeline;

  /* Touch-only: tap a tag to toggle its glow on/off (desktop keeps :hover,
     and stays untouched — no extra tab stops). */
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [glow, setGlow] = useState<Set<number>>(new Set());
  const toggleGlow = (i: number) =>
    setGlow((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <article
      id={`project-${project.id}`}
      className="cs-slide"
      data-project-id={project.id}
      data-cursor-label={project.title}
      style={{ "--card-hue": hue } as React.CSSProperties}
      aria-label={`Project: ${project.title}`}
      aria-hidden={scrubActive && !active}
      inert={scrubActive && !active ? true : undefined}
    >
      {/* LEFT — visual column */}
      {hasImage ? (
        <ProjectVisual project={project} hue={hue} priority={index === 0} eager={eager} onOpen={onOpen} />
      ) : (
        <div className="cs-visual-col">
          <CometCard rotateDepth={10} translateDepth={6}>
            <div className="cs-visual" style={{ "--card-hue": hue } as React.CSSProperties}>
              <div className="sd-card-accent" aria-hidden="true" />
              {pipeline ? (
                <div
                  className="sd-pipeline"
                  style={{ background: `hsl(${hue.split(",")[0]}, 15%, 8%)` }}
                  aria-label="Processing pipeline"
                >
                  {pipeline.map((step, si, arr) => (
                    <React.Fragment key={step}>
                      <div className="sd-pipeline-node" style={{ animationDelay: `${si * 0.4}s` }}>
                        {step}
                      </div>
                      {si < arr.length - 1 && (
                        <div className="sd-pipeline-wire">
                          <div className="sd-pipeline-pulse" style={{ animationDelay: `${si * 0.4}s` }} />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div
                  className="sd-placeholder"
                  style={{ background: `hsl(${hue.split(",")[0]}, 12%, 8%)` }}
                  aria-hidden="true"
                >
                  <span className="sd-placeholder-label mono">{project.title.toUpperCase()}</span>
                </div>
              )}
            </div>
          </CometCard>
        </div>
      )}

      {/* RIGHT — copy */}
      <div className="cs-text">
        <h3 className="cs-title">{project.title}</h3>
        <span className="cs-subtitle" style={{ color: `hsl(${hue})` }}>
          {project.subtitle}
        </span>
        <p className="cs-metric mono">{metric}</p>
        <p className="cs-desc">{project.description}</p>
        <ul className="cs-proof" aria-label={`${project.title} technical highlights`}>
          {((project as { proofPoints?: readonly string[] }).proofPoints ?? []).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        {note && <p className="cs-note mono">{note}</p>}
        <ul className="sd-card-tags" aria-label="Technologies">
          {tags.map((tag, ti) => (
            <li
              key={tag}
              className={`sd-tag mono${glow.has(ti) ? " is-glow" : ""}`}
              {...(isTouch
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    "aria-pressed": glow.has(ti),
                    onClick: () => toggleGlow(ti),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleGlow(ti);
                      }
                    },
                  }
                : {})}
            >
              {tag}
            </li>
          ))}
        </ul>
        <div className="cs-links">
          {((project as { links?: readonly { label: string; href: string; demo?: boolean }[] }).links
            ?? [{ label: "View Source", href: project.github }]).map((l, li) => (
            <a
              key={li}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`sd-card-link${l.demo ? " cs-demo" : ""}`}
              aria-label={`${l.label}, ${project.title}`}
            >
              <span>{l.label}</span>
              <ArrowUpRightIcon />
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function StickyDeckSection({
  portfolioSectionRef,
  motionEnabled = true,
}: {
  portfolioSectionRef?: React.RefObject<HTMLElement | null>;
  motionEnabled?: boolean;
}) {
  const fallbackRef = useRef<HTMLElement>(null);
  const sectionRef = portfolioSectionRef || fallbackRef;
  const trackRef = useRef<HTMLDivElement>(null);
  const railButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /* the active scrub trigger — read by the rail's click-to-jump handler */
  const stRef = useRef<ScrollTrigger | null>(null);
  const snapSuspendedRef = useRef(false);
  const snapResumeTimerRef = useRef<number | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  /* Active slide index, mirrored from render()'s imperative scrub so the
     image-gating logic below (a plain render decision, not layout/paint)
     can read it without touching the opacity/transform writes themselves. */
  const [activeSlide, setActiveSlide] = useState(0);
  const activeIdxRef = useRef(0);
  /* Whether the desktop scrub ScrollTrigger is live — false on mobile /
     reduced-motion, where slides stack in normal flow and all should be
     eager. */
  const [scrubActive, setScrubActive] = useState(false);
  /* Which "Additional systems" row is expanded (one at a time). Hover
     drives it on fine pointers, tap on touch. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /* Lazy init, SSR-safe: hoverCapable only gates which event handlers are
     attached (never serialized markup), so a server false → client true
     divergence can't cause a hydration mismatch. */
  const [hoverCapable] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );

  /* Expanding a row changes document height above sd-outro, whose bottom
     edge anchors the boundary-0 CRT trigger (and everything below it on
     the desktop pinned story). Re-measure once the ~350ms panel
     transition has finished. Skipped on mount. */
  const expandRefreshArmedRef = useRef(false);
  useEffect(() => {
    if (!expandRefreshArmedRef.current) {
      expandRefreshArmedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      ScrollTrigger.refresh();
      getLenis()?.resize();
    }, 420);
    return () => window.clearTimeout(timer);
  }, [expandedId]);

  /* ── Entrance reveals (fade + rise) ──────────────────────────────
     IO-driven, fail-open: the hidden state only exists via the
     `data-io-armed` attribute this effect stamps — JS dead means
     nothing is ever hidden. The desktop scrub owns .cs-slide opacity
     per-tick, so slides are only armed on the natural-flow tiers;
     .more-work-item rows reveal on every tier (they sit below the
     scrub region in normal flow everywhere). */
  useEffect(() => {
    const root = sectionRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const naturalFlow =
      !scrubActive && !window.matchMedia(IMMERSIVE_SCROLL_MEDIA_QUERY).matches;
    const targets: HTMLElement[] = [
      ...root.querySelectorAll<HTMLElement>(".more-work-item"),
      ...(naturalFlow
        ? root.querySelectorAll<HTMLElement>(".cs-slide, .sd-header .ed-header")
        : []),
    ];
    if (!targets.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        /* Entries landing in the same batch stagger off each other */
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, batchIndex) => {
            const el = entry.target as HTMLElement;
            el.style.transitionDelay = `${batchIndex * 90}ms`;
            el.dataset.ioIn = "true";
            io.unobserve(el);
          });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    targets.forEach((el) => {
      el.dataset.ioArmed = "true";
      io.observe(el);
    });

    return () => {
      io.disconnect();
      targets.forEach((el) => {
        delete el.dataset.ioArmed;
        delete el.dataset.ioIn;
        el.style.removeProperty("transition-delay");
      });
    };
  }, [scrubActive, sectionRef]);

  const suspendSnap = useCallback((fallbackMs: number) => {
    snapSuspendedRef.current = true;
    if (snapResumeTimerRef.current !== null) {
      window.clearTimeout(snapResumeTimerRef.current);
    }
    snapResumeTimerRef.current = window.setTimeout(() => {
      snapSuspendedRef.current = false;
      snapResumeTimerRef.current = null;
    }, fallbackMs);
  }, []);

  useEffect(() => () => {
    if (snapResumeTimerRef.current !== null) {
      window.clearTimeout(snapResumeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const exposeStaticDeck = () => {
      stRef.current?.kill();
      stRef.current = null;
      const section = sectionRef.current;
      if (section) {
        gsap.set(section, { clearProps: "opacity,pointerEvents" });
      }
      const track = trackRef.current;
      if (track) {
        track.dataset.scrubReady = "false";
        gsap.set(track.querySelectorAll(".cs-slide, .cs-text"), {
          clearProps: "opacity,transform,pointerEvents,visibility,willChange",
        });
      }
      setScrubActive(false);
      setActiveSlide(0);
      activeIdxRef.current = 0;
    };

    window.addEventListener(MOTION_FAILED_EVENT, exposeStaticDeck);
    return () =>
      window.removeEventListener(MOTION_FAILED_EVENT, exposeStaticDeck);
  }, [sectionRef]);

  useGSAP(() => {
    const track = trackRef.current;
    if (!track || !motionEnabled) return;

    const slides = gsap.utils.toArray<HTMLElement>(".cs-slide", track);
    const texts = slides.map((slide) => slide.querySelector<HTMLElement>(".cs-text"));
    const progress = track.querySelector<HTMLElement>(".cs-progress");
    const fill = track.querySelector<HTMLElement>(".cs-progress-fill");
    const knob = track.querySelector<HTMLElement>(".cs-progress-knob");
    if (slides.length !== N) return;

    const lastA = slides.map(() => -1);
    let progressWidth = 0;
    const measureProgress = () => {
      progressWidth = progress?.getBoundingClientRect().width ?? 0;
    };
    const resetPresentation = () => {
      track.dataset.scrubReady = "false";
      stRef.current = null;
      setScrubActive(false);
      gsap.set(slides, { clearProps: "opacity,pointerEvents" });
      texts.forEach((text) => {
        if (text) text.style.transform = "";
      });
      fill?.style.removeProperty("width");
      fill?.style.removeProperty("transform-origin");
      fill?.style.removeProperty("transform");
      knob?.style.removeProperty("transform");
      lastA.fill(-1);
    };

    /* p is the project position (0→2); scrollProgress remains the exact
       track phase (0→1), including the three reading holds. */
    const render = (p: number, scrollProgress: number) => {
      slides.forEach((slide, index) => {
        const nearness = Math.max(0, 1 - Math.abs(index - p));
        if (Math.abs(nearness - lastA[index]) < 0.001) return;
        lastA[index] = nearness;
        slide.style.opacity = nearness.toFixed(3);
        slide.style.pointerEvents = nearness > 0.5 ? "auto" : "none";

        const text = texts[index];
        if (text) {
          const textProgress = Math.max(0, Math.min(1, (nearness - 0.25) / 0.75));
          text.style.transform =
            `translate3d(0, ${((1 - textProgress) * 26).toFixed(1)}px, 0)`;
        }
      });

      const index = Math.round(p);
      if (index !== activeIdxRef.current) {
        activeIdxRef.current = index;
        setActiveSlide(index);
      }

      const percent = scrollProgress * 100;
      if (fill) fill.style.transform = `scaleX(${(percent / 100).toFixed(4)})`;
      if (knob) {
        knob.style.transform =
          `translate3d(${(progressWidth * scrollProgress).toFixed(2)}px, 0, 0) translateX(-50%)`;
      }
    };

    const mm = gsap.matchMedia();
    let cancelled = false;

    try {
      mm.add(
        IMMERSIVE_SCROLL_MEDIA_QUERY,
        () => {
          /* The data attribute turns on sticky/absolute enhancement CSS.
             Static document flow is the baseline if setup fails. */
          track.dataset.scrubReady = "true";
          setScrubActive(true);

          try {
            if (fill) {
              fill.style.width = "100%";
              fill.style.transformOrigin = "left center";
            }
            measureProgress();
            const renderProgress = (progress: number) =>
              render(projectPositionAt(progress), progress);
            const st = ScrollTrigger.create({
              trigger: track,
              start: "top top",
              end: "bottom bottom",
              invalidateOnRefresh: true,
              snap: {
                snapTo: (value) =>
                  snapSuspendedRef.current
                    ? value
                    : gsap.utils.snap(PROJECT_HOLDS.map((hold) => hold.midpoint), value),
                delay: 0.12,
                duration: { min: 0.15, max: 0.35 },
                ease: "power2.inOut",
              },
              onUpdate: (self) => renderProgress(self.progress),
              onRefresh: (self) => {
                measureProgress();
                renderProgress(self.progress);
              },
            });
            stRef.current = st;
            renderProgress(st.progress);

            return () => {
              st.kill();
              resetPresentation();
            };
          } catch {
            resetPresentation();
          }
        }
      );

      document.fonts?.ready.then(() => {
        if (!cancelled) ScrollTrigger.refresh();
      });
    } catch {
      resetPresentation();
    }

    return () => {
      cancelled = true;
      mm.revert();
      resetPresentation();
    };
  }, {
    scope: sectionRef,
    dependencies: [motionEnabled],
    revertOnUpdate: true,
  });

  /* Jump to a project by scrolling to its position within the sticky track.
     Routed through the shared Lenis instance so it inherits the site's eased
     momentum (matching the {J} logo's power4.inOut feel). */
  const jumpTo = (requestedIndex: number, immediate = false) => {
    const index = Math.max(0, Math.min(N - 1, requestedIndex));
    const st = stRef.current;
    const lenis = getLenis();
    const t = st?.getTween(true);
    if (t && typeof t !== "number") t.kill();
    suspendSnap(immediate ? 240 : 1_800);
    const finishProgrammaticScroll = () => suspendSnap(180);

    if (!st) {
      setActiveSlide(index);
      activeIdxRef.current = index;
      const slide = trackRef.current?.querySelectorAll<HTMLElement>(".cs-slide")[index];
      if (!slide) return;

      if (lenis) {
        if (immediate) {
          lenis.scrollTo(slide, {
            immediate: true,
            force: true,
            offset: -96,
            onComplete: finishProgrammaticScroll,
          });
        } else {
          lenis.scrollTo(slide, {
            duration: 1,
            easing: power4InOut,
            offset: -96,
            onComplete: finishProgrammaticScroll,
          });
        }
      } else {
        slide.scrollIntoView({
          behavior: immediate ? "auto" : "smooth",
          block: "start",
        });
      }
      return;
    }

    const midpoint = PROJECT_HOLDS[index].midpoint;
    const target = st.start + midpoint * (st.end - st.start);
    if (lenis) {
      if (immediate) {
        lenis.scrollTo(target, {
          immediate: true,
          force: true,
          onComplete: finishProgrammaticScroll,
        });
      } else {
        lenis.scrollTo(target, {
          duration: 1.3,
          easing: power4InOut,
          onComplete: finishProgrammaticScroll,
        });
      }
    } else {
      window.scrollTo({ top: target, behavior: immediate ? "auto" : "smooth" });
    }
  };

  const onRailKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = index - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = index + 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = N - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const clamped = Math.max(0, Math.min(N - 1, nextIndex));
    railButtonRefs.current[clamped]?.focus();
    jumpTo(clamped, true);
  };

  return (
    <section
      ref={sectionRef}
      className="sticky-deck-section"
      id="projects"
      style={{ opacity: 0, pointerEvents: "none" }}
    >
      {/* ── Section header — standalone full-viewport page.
             PIXEL-CAPTURED into the laptop's WebGL screen texture
             (app/assets-render/projects-header) and crossfaded into this
             DOM at the hero→projects handoff. Do not alter markup/copy. ── */}
      <div className="container sd-header">
        <header className="ed-header">
          <div className="ed-header-row">
            <span className="ed-eyebrow">Projects</span>
          </div>
          <h2 className="ed-heading ed-heading--indent">
            Selected <em>Work</em>
          </h2>
        </header>
      </div>

      {/* ── Case-study stage ─────────────────────────────────────────────
             One project on screen at a time. Desktop holds the inner
             viewport with position:sticky and scrubs the active project;
             the thumbnail rail jumps on click. Mobile / reduced-motion
             fall back to a plain vertical stack (CSS), no scrub. ── */}
      <div
        ref={trackRef}
        id="projects-first-case-study"
        className="cs-track"
        data-scrub-ready={scrubActive ? "true" : "false"}
        style={{ "--cs-count": N } as React.CSSProperties}
      >
        <div
          className="chapter-marker chapter-marker--projects-landing"
          data-scroll-landing="projects"
          data-scroll-landing-clearance="none"
          aria-hidden="true"
        />
        <div
          className="chapter-marker chapter-marker--projects-spy"
          data-scroll-spy="projects"
          data-scroll-spy-clearance="none"
          aria-hidden="true"
        />
        <div className="cs-viewport">
          <span className="cs-ghost" aria-hidden="true">{pad(activeSlide + 1)}</span>

          <div className="cs-topbar">
            <span className="cs-eyebrow">Selected Work</span>
            <span className="cs-counter">
              <span className="cs-counter-cur">{pad(activeSlide + 1)}</span> / {pad(N)}
            </span>
          </div>

          <div className="cs-stagebox">
            {FEATURED_PROJECTS.map((project, i) => {
              const hue = hueOf(project.id);
              const eager = !scrubActive || Math.abs(i - activeSlide) <= 1;
              return (
                <ProjectSlide
                  key={project.id}
                  project={project}
                  index={i}
                  hue={hue}
                  eager={eager}
                  active={i === activeSlide}
                  scrubActive={scrubActive}
                  onOpen={(start) =>
                    setLightbox({
                      images: [...((project.images ?? []) as readonly string[])],
                      alts: [...((project.imageAlts ?? []) as readonly string[])],
                      title: project.title,
                      hue,
                      start,
                    })
                  }
                />
              );
            })}
          </div>

          {/* Progress rail + clickable thumbnails */}
          <div className="cs-progress" aria-hidden="true">
            <div className="cs-progress-fill" />
            <div className="cs-progress-knob" />
          </div>

          <nav className="cs-rail" aria-label="Jump to project">
            {FEATURED_PROJECTS.map((project, i) => (
              <button
                key={project.id}
                ref={(node) => {
                  railButtonRefs.current[i] = node;
                }}
                type="button"
                className={`cs-thumb${i === activeSlide ? " is-active" : ""}`}
                onClick={(event) => jumpTo(i, event.detail === 0)}
                onKeyDown={(event) => onRailKeyDown(event, i)}
                aria-label={`Go to ${project.title}`}
                aria-controls={`project-${project.id}`}
                aria-current={i === activeSlide ? "true" : undefined}
              >
                <span className="cs-thumb-num mono">{pad(i + 1)}</span>
                <span className="cs-thumb-name">{project.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {SECONDARY_PROJECTS.length > 0 && (
      <div className="more-work">
        <div className="container">
          <header className="more-work-header">
            <span className="ed-eyebrow">More work</span>
            <h3>Additional systems</h3>
          </header>
          <div className="more-work-list">
            {SECONDARY_PROJECTS.map((project, index) => {
              const links =
                (project as { links?: readonly { label: string; href: string }[] }).links ??
                [{ label: "View Source", href: project.github }];
              const expanded = expandedId === project.id;
              const panelId = `more-work-panel-${project.id}`;
              return (
                <article
                  className={`more-work-item${expanded ? " is-expanded" : ""}`}
                  key={project.id}
                  /* Fine pointers expand on hover; touch relies on the
                     row button's click toggle below. */
                  onMouseEnter={hoverCapable ? () => setExpandedId(project.id) : undefined}
                  onMouseLeave={
                    hoverCapable
                      ? () => {
                          /* The lightbox portals over the whole viewport, so
                             opening one fires mouseleave here and would
                             collapse the row behind it — leaving nothing to
                             return to on close. Freeze while it's open. */
                          if (lightbox) return;
                          setExpandedId((current) => (current === project.id ? null : current));
                        }
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="more-work-row"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={(event) => {
                      /* On hover-capable devices hover already governs the
                         row, so a mouse click would arrive with the panel
                         ALREADY open and immediately collapse it. Ignore
                         real clicks there and honour only keyboard
                         activation (detail === 0), the same idiom the rail
                         uses in jumpTo. Touch has no hover, so it toggles
                         normally. */
                      if (hoverCapable && event.detail !== 0) return;
                      setExpandedId(expanded ? null : project.id);
                    }}
                  >
                    <span className="more-work-index mono">{pad(index + 4)}</span>
                    <span className="more-work-title">
                      <h4>{project.title}</h4>
                      <p>{project.subtitle}</p>
                    </span>
                    <strong>{project.metric}</strong>
                    <span className="more-work-chevron" aria-hidden="true">+</span>
                  </button>

                  <div id={panelId} className="more-work-panel">
                    <div className="more-work-panel-inner">
                      <p className="more-work-desc">{project.description}</p>
                      <p className="more-work-tech mono">{project.tech}</p>
                      <div className="more-work-links">
                        {links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span>{link.label}</span>
                            <ArrowUpRightIcon />
                          </a>
                        ))}
                      </div>
                      <div className="more-work-strip">
                        {project.images.map((src, imageIndex) => {
                          const alt = project.imageAlts?.[imageIndex] ?? project.title;
                          return (
                            <button
                              key={src}
                              type="button"
                              className="more-work-thumb"
                              aria-label={`View ${alt} enlarged`}
                              onClick={(event) => {
                                /* The row header owns expand/collapse — keep the
                                   click from bubbling or the disclosure closes
                                   underneath the lightbox. */
                                event.stopPropagation();
                                setLightbox({
                                  images: [...(project.images as readonly string[])],
                                  alts: [...((project.imageAlts ?? []) as readonly string[])],
                                  title: project.title,
                                  hue: hueOf(project.id),
                                  start: imageIndex,
                                });
                              }}
                            >
                              {/* sizes matches the fixed tile width exactly —
                                  the previous 240px against a width:auto tile
                                  made 7.2:1 diagrams render ~1085px from a
                                  ~256px source (the blur). */}
                              <Image
                                src={src}
                                alt={alt}
                                width={680}
                                height={300}
                                quality={95}
                                loading="lazy"
                                /* breakpoint mirrors the 900px tile override
                                   in evolution.css — keep them in sync */
                                sizes="(max-width: 900px) 260px, 340px"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* ── Outro / CTA — boundary 0 starts when this block's bottom edge
             crosses the viewport center. The remaining outro runway carries
             the CRT wipe through to completion by the time Building reaches
             the top. ── */}
      <div className="sd-outro">
        <div className="container sd-cta">
          <p>Have a backend or API project in mind?</p>
          <a
            href="#contact"
            className="btn btn-outline"
            id="projects-cta-btn"
          >
            <HoverScrambleText text="Get in touch" />
          </a>
        </div>
      </div>

      {lightbox && <Lightbox {...lightbox} onClose={closeLightbox} />}
    </section>
  );
}
