"use client";

import type { ThemeMode } from "@openuidev/react-ui";
import { Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Light/dark mode: the visitor's choice (saved in this browser), else the system setting.
 * `themeScript` sets <html data-theme> before first paint so the page never flashes the
 * wrong colours; the travel components' CSS keys off that attribute.
 */
const STORAGE_KEY = "wf-theme";
const listeners = new Set<() => void>();

function read(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Follow the system setting until the visitor picks a mode themselves.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked: follow the system */
    }
    if (saved) return;
    document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    listeners.forEach((l) => l());
  };
  media.addEventListener("change", onSystem);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystem);
  };
}

export function useThemeMode(): [ThemeMode, () => void] {
  const mode = useSyncExternalStore(subscribe, read, () => "light" as ThemeMode);
  const toggle = useCallback(() => {
    const next: ThemeMode = read() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* still switches for this visit */
    }
    listeners.forEach((l) => l());
  }, []);
  return [mode, toggle];
}

/** Inline in <head>: applies the saved or system mode before the page paints. */
export const themeScript = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

/**
 * Icon, label and switch position come from CSS on <html data-theme>, which is right from the
 * first paint; React state isn't known until hydration, so it only drives the click.
 */
export function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="wf-theme-toggle"
      onClick={onToggle}
      aria-label="Dark mode"
      aria-pressed={mode === "dark"}
      title="Switch light or dark mode"
    >
      <Sun size={16} aria-hidden className="wf-theme-toggle__light" />
      <Moon size={16} aria-hidden className="wf-theme-toggle__dark" />
      <span className="wf-theme-toggle__text">
        <span className="wf-theme-toggle__light">Light mode</span>
        <span className="wf-theme-toggle__dark">Dark mode</span>
      </span>
      <span className="wf-theme-toggle__switch" aria-hidden />
    </button>
  );
}
