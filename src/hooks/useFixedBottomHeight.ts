import { useLayoutEffect, useRef } from "react";

type HeightVariable = "--app-bottom-nav-height" | "--app-bottom-action-height";

/** Reserve the full rendered bar height, including mobile safe-area padding. */
export function useFixedBottomHeight<T extends HTMLElement>(variable: HeightVariable) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      root.style.setProperty(variable, `${height}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element, { box: "border-box" });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty(variable);
    };
  }, [variable]);
  return ref;
}
