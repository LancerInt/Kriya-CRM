"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Global tooltip provider — replaces every native HTML `title=""` tooltip
 * (the dated beige OS popup) with a modern dark tooltip, without touching
 * any of the 193 existing `title=` attributes scattered across the app.
 *
 * How it works:
 *   1. On mount, walks the DOM and moves every `title` attribute onto a
 *      `data-tt` attribute, then strips the `title` so the browser's native
 *      tooltip never fires. A MutationObserver keeps doing this for any
 *      newly-rendered nodes (modals, lists, etc.).
 *   2. Listens at the document level for mouseover/mouseout/focusin/focusout.
 *      When the cursor (or keyboard focus) lands on a `data-tt` element we
 *      render a portaled, positioned tooltip with a tiny arrow.
 *
 * Drop this component once at the root of the dashboard layout and every
 * tooltip in the app instantly looks modern. No per-component changes.
 */
export default function GlobalTooltip() {
  const [tip, setTip] = useState(null); // { text, x, y, placement }
  const tipRef = useRef(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    // ── Step 1: convert title → data-tt on every existing element ──
    const swap = (root) => {
      if (!root || typeof root.querySelectorAll !== "function") return;
      const all = root.querySelectorAll("[title]");
      all.forEach((el) => {
        const t = el.getAttribute("title");
        if (t) {
          el.setAttribute("data-tt", t);
          el.removeAttribute("title");
        }
      });
      // Also handle the root itself if it has a title
      if (root.getAttribute && root.getAttribute("title")) {
        const t = root.getAttribute("title");
        root.setAttribute("data-tt", t);
        root.removeAttribute("title");
      }
    };
    swap(document.body);

    // Watch for new nodes being added (React re-renders, modals, etc.)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "title") {
          swap(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) swap(n);
          });
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["title"],
    });

    // ── Step 2: hover/focus listeners ──
    const findTtNode = (node) => {
      let cur = node;
      while (cur && cur.nodeType === 1) {
        if (cur.hasAttribute && cur.hasAttribute("data-tt")) return cur;
        cur = cur.parentNode;
      }
      return null;
    };

    let showTimer = null;
    const handleEnter = (e) => {
      const node = findTtNode(e.target);
      if (!node) return;
      const text = node.getAttribute("data-tt");
      if (!text) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        const r = node.getBoundingClientRect();
        // Default: above the element, centered
        let x = r.left + r.width / 2;
        let y = r.top - 8;
        let placement = "top";
        // If too close to top, flip below
        if (r.top < 40) {
          y = r.bottom + 8;
          placement = "bottom";
        }
        setTip({ text, x, y, placement });
      }, 180);
    };
    const handleLeave = (e) => {
      // Only hide if we actually left the data-tt element
      const node = findTtNode(e.target);
      const related = findTtNode(e.relatedTarget);
      if (node && node === related) return;
      clearTimeout(showTimer);
      setTip(null);
    };
    const handleScroll = () => setTip(null);
    const handleClick = () => setTip(null);

    document.addEventListener("mouseover", handleEnter, true);
    document.addEventListener("mouseout", handleLeave, true);
    document.addEventListener("focusin", handleEnter, true);
    document.addEventListener("focusout", handleLeave, true);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      observer.disconnect();
      clearTimeout(showTimer);
      document.removeEventListener("mouseover", handleEnter, true);
      document.removeEventListener("mouseout", handleLeave, true);
      document.removeEventListener("focusin", handleEnter, true);
      document.removeEventListener("focusout", handleLeave, true);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  if (!tip || typeof document === "undefined") return null;

  // Clamp horizontally so the tooltip can't escape the viewport
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const tipW = Math.min(280, (tip.text?.length || 0) * 7 + 24);
  let left = tip.x - tipW / 2;
  if (left < 8) left = 8;
  if (left + tipW > vw - 8) left = vw - tipW - 8;

  const isTop = tip.placement === "top";

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      style={{
        position: "fixed",
        top: tip.y,
        left,
        width: tipW,
        transform: isTop ? "translateY(-100%)" : "none",
        zIndex: 2147483647,
        pointerEvents: "none",
      }}
      className="select-none"
    >
      <div className="relative bg-gray-900 text-white text-[11px] font-medium leading-snug px-2.5 py-1.5 rounded-lg shadow-xl ring-1 ring-black/10">
        {tip.text}
        {/* Arrow */}
        <span
          className="absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"
          style={
            isTop
              ? { bottom: -3, boxShadow: "1px 1px 0 rgba(0,0,0,0.05)" }
              : { top: -3, boxShadow: "-1px -1px 0 rgba(0,0,0,0.05)" }
          }
        />
      </div>
    </div>,
    document.body
  );
}
