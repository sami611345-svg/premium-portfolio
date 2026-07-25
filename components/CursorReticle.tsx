"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/* Detection-reticle cursor: four corner brackets that follow the pointer and
   expand to frame interactive targets with a [ LABEL · 0.9X ] confidence
   readout, echoing the object-detection work in the projects below.

   Renders nothing (and leaves the native cursor alone) unless the device has
   a fine pointer AND the user allows motion. All hover detection is delegated
   at the document level — no listeners are ever attached to the targets
   themselves, so CometCard tilt, HoverScrambleText, and CSS :hover states
   keep working untouched. */

const IDLE = 20; // idle bracket-box size (px)
const PAD = 6; // breathing room around a locked target
const DOT_R = 2; // half the dot size — dot is 2×DOT_R px
const FOLLOW = 0.22; // idle pointer-follow lerp factor
const SNAP = 0.3; // lock/unlock lerp factor (~150ms convergence at 60fps)
const DOT = 0.45; // dot lerp — tighter than the box; it's the precision layer
const EPS = 0.05; // settle threshold below which the loop parks
const SCRAMBLE_MS = 250;
/* Same glyph set as HoverScrambleText so the label decode reads as one system */
const CHARS = "!<>-_\\/[]{}~=+*^?#_";

type Match = { el: Element; label: string; conf: string };

/* Stable pseudo-confidence per target so cards read as individually "detected"
   (0.91–0.98) instead of sharing one copy-pasted number. */
function confidenceFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return (0.91 + (Math.abs(h) % 8) * 0.01).toFixed(2);
}

/* All closest() candidates are ancestors of the hovered node, so they form a
   chain — the deepest one is the most specific match (a link inside a project
   card reads LINK, not the project name). Ties (one element matching two
   rules, e.g. a resume <a>) go to the earlier rule. */
function resolveTarget(from: Element): Match | null {
  let best: Match | null = null;
  const consider = (el: Element | null, label: string, conf: string) => {
    if (!el) return;
    if (!best || (best.el !== el && best.el.contains(el))) best = { el, label, conf };
  };

  const card = from.closest("[data-cursor-label]");
  if (card) {
    const label = card.getAttribute("data-cursor-label") || "TARGET";
    consider(card, label, confidenceFor(card.getAttribute("data-project-id") || label));
  }
  consider(from.closest(".gravity-pit"), "DRAG", "0.88");
  consider(from.closest('a[href*="Abdus_Sami_Resume"]'), "RESUME", "1.00");
  /* data-cursor-ignore opts a control out of the generic matcher — used for
     large zone-like triggers (the card image's lightbox role="button") that
     should read as their labelled ancestor, not as a LINK. */
  const generic = from.closest('a, button, [role="button"]');
  if (generic && !generic.hasAttribute("data-cursor-ignore")) {
    consider(generic, "LINK", "1.00");
  }
  return best;
}

export default function CursorReticle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
      () => {
        setEnabled(true);
        return () => setEnabled(false);
      },
    );
    return () => mm.revert();
  }, []);

  return enabled ? <Reticle /> : null;
}

function Reticle() {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const boxEl = boxRef.current;
    const dotEl = dotRef.current;
    const label = labelRef.current;
    if (!root || !boxEl || !dotEl || !label) return;

    document.documentElement.classList.add("reticle-on");

    const setX = gsap.quickSetter(boxEl, "x", "px") as (v: number) => void;
    const setY = gsap.quickSetter(boxEl, "y", "px") as (v: number) => void;
    const setW = gsap.quickSetter(boxEl, "width", "px") as (v: number) => void;
    const setH = gsap.quickSetter(boxEl, "height", "px") as (v: number) => void;
    const setDotX = gsap.quickSetter(dotEl, "x", "px") as (v: number) => void;
    const setDotY = gsap.quickSetter(dotEl, "y", "px") as (v: number) => void;

    const pointer = { x: -100, y: -100 };
    const box = { x: -100 - IDLE / 2, y: -100 - IDLE / 2, w: IDLE, h: IDLE };
    const dot = { x: -100, y: -100 };
    let lock: Match | null = null;
    let running = false;
    let scrambleRaf = 0;

    const tick = () => {
      let tx: number, ty: number, tw: number, th: number, f: number;
      if (lock) {
        /* Re-measure every frame while locked so the frame stays glued to the
           target through Lenis scroll and layout shifts. One rect read on one
           element per frame — same budget CometCard already spends. */
        const r = lock.el.getBoundingClientRect();
        tx = r.left - PAD;
        ty = r.top - PAD;
        tw = r.width + PAD * 2;
        th = r.height + PAD * 2;
        f = SNAP;
      } else {
        tx = pointer.x - IDLE / 2;
        ty = pointer.y - IDLE / 2;
        tw = IDLE;
        th = IDLE;
        f = FOLLOW;
      }

      box.x += (tx - box.x) * f;
      box.y += (ty - box.y) * f;
      box.w += (tw - box.w) * f;
      box.h += (th - box.h) * f;
      setX(box.x);
      setY(box.y);
      setW(box.w);
      setH(box.h);

      /* The dot always chases the live pointer, outside the lock state machine
         entirely — while the box frames a large target ("you're in this zone"),
         the dot stays the precise "your pointer is exactly here" layer. On
         small targets the pointer is inside the tight box anyway, so the two
         naturally coincide without any size threshold. */
      dot.x += (pointer.x - dot.x) * DOT;
      dot.y += (pointer.y - dot.y) * DOT;
      setDotX(dot.x - DOT_R);
      setDotY(dot.y - DOT_R);

      /* Park once settled while idle (CometCard's wake/park pattern); a locked
         reticle keeps ticking because its target rect can move under it. */
      if (
        !lock &&
        Math.abs(tx - box.x) < EPS &&
        Math.abs(ty - box.y) < EPS &&
        Math.abs(tw - box.w) < EPS &&
        Math.abs(th - box.h) < EPS &&
        Math.abs(pointer.x - dot.x) < EPS &&
        Math.abs(pointer.y - dot.y) < EPS
      ) {
        box.x = tx;
        box.y = ty;
        box.w = tw;
        box.h = th;
        setX(tx);
        setY(ty);
        setW(tw);
        setH(th);
        dot.x = pointer.x;
        dot.y = pointer.y;
        setDotX(dot.x - DOT_R);
        setDotY(dot.y - DOT_R);
        running = false;
        gsap.ticker.remove(tick);
      }
    };

    const wake = () => {
      if (!running) {
        running = true;
        gsap.ticker.add(tick);
      }
    };

    const scrambleIn = (text: string) => {
      cancelAnimationFrame(scrambleRaf);
      const start = performance.now();
      const frame = (t: number) => {
        const solved = Math.floor(((t - start) / SCRAMBLE_MS) * text.length);
        if (solved >= text.length) {
          label.textContent = text;
          return;
        }
        label.textContent = text
          .split("")
          .map((c, i) => (c === " " || i < solved ? c : CHARS[(Math.random() * CHARS.length) | 0]))
          .join("");
        scrambleRaf = requestAnimationFrame(frame);
      };
      scrambleRaf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      root.classList.add("is-visible");
      wake();
    };

    const onOver = (e: PointerEvent) => {
      const match = e.target instanceof Element ? resolveTarget(e.target) : null;
      if (match?.el === lock?.el) return;
      lock = match;
      if (match) {
        root.classList.add("is-locked");
        /* Label placement, decided once per lock: inside the frame for tall
           targets (never overlaps content outside the box — e.g. the Skills
           paragraph above the gravity pit), below the box for small targets
           near the viewport top (nav links — above would clip offscreen),
           otherwise the default above-the-box position. */
        const r = match.el.getBoundingClientRect();
        root.classList.toggle("is-inside", r.height >= 120);
        root.classList.toggle("is-below", r.height < 120 && r.top < 56);
        scrambleIn(`[ ${match.label.toUpperCase()} · ${match.conf} ]`);
      } else {
        root.classList.remove("is-locked", "is-inside", "is-below");
        cancelAnimationFrame(scrambleRaf);
        label.textContent = "";
      }
      wake();
    };

    /* relatedTarget === null means the pointer left the window entirely */
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget === null) {
        lock = null;
        root.classList.remove("is-visible", "is-locked", "is-inside", "is-below");
        label.textContent = "";
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      gsap.ticker.remove(tick);
      cancelAnimationFrame(scrambleRaf);
      document.documentElement.classList.remove("reticle-on");
    };
  }, []);

  return (
    <div ref={rootRef} className="cursor-reticle" aria-hidden="true">
      <div ref={boxRef} className="cr-box">
        <span className="cr-corner cr-tl" />
        <span className="cr-corner cr-tr" />
        <span className="cr-corner cr-bl" />
        <span className="cr-corner cr-br" />
        <span ref={labelRef} className="cr-label" />
      </div>
      <span ref={dotRef} className="cr-dot" />
    </div>
  );
}
