"use client";

import { useEffect, useRef } from "react";
import type React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open layers, innermost last. Only the top layer reacts to Escape/Tab, so a
// confirmation opened over the clone drawer doesn't close both at once.
const layers: symbol[] = [];

/**
 * Modal keyboard behavior for dialogs and drawers: moves focus inside on open
 * (to `[data-autofocus]` if present), keeps Tab cycling within the layer,
 * closes on Escape, and returns focus to the triggering element on close.
 */
export function useDialogFocus(ref: React.RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const layer = Symbol("dialog-layer");
    layers.push(layer);
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;

    const focusables = () =>
      node ? [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0) : [];

    // Defer one frame so content rendered in the same commit is focusable.
    const raf = requestAnimationFrame(() => {
      const target = node?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? node;
      target?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (layers[layers.length - 1] !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !node?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !node?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      layers.splice(layers.indexOf(layer), 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, ref]);
}
