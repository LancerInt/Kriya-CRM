"use client";
import { useEffect, useState } from "react";

/**
 * Fits a desktop-tuned editor (Quotation, PI, CI, LI, PIF) into a mobile
 * viewport by zooming the content. The form keeps its A4 column proportions
 * and table layout — it just renders smaller.
 *
 * On a viewport ≥ targetWidth (default 860px) the hook returns {} (no zoom).
 * Below that it returns `{ width: '<targetWidth>px', zoom: <factor> }` where
 * factor = viewport / targetWidth, clamped to a readable minimum.
 *
 * CSS `zoom` (unlike transform: scale) affects layout flow — so the parent
 * container collapses to the scaled size, no extra space is reserved.
 *
 * Browser support: zoom is supported in Chrome, Edge, Safari, and Firefox
 * 126+ (May 2024). On older Firefox the editor falls back to horizontal
 * scroll because the wrapper still has overflow-x-auto.
 */
export default function useResponsiveZoom({ targetWidth = 860, minZoom = 0.35, padding = 16 } = {}) {
  const [style, setStyle] = useState({});

  useEffect(() => {
    const update = () => {
      const w = typeof window !== "undefined" ? window.innerWidth : targetWidth;
      if (w < targetWidth) {
        const scale = Math.max(minZoom, (w - padding) / targetWidth);
        setStyle({ width: `${targetWidth}px`, zoom: scale });
      } else {
        setStyle({});
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [targetWidth, minZoom, padding]);

  return style;
}
