"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noop = () => () => {};
/** False during SSR and hydration, true after — the theme is only known in the browser. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Sun/moon toggle. The switch is one compositor cross-fade (View Transitions API, see
 * ::view-transition-* in globals.css) instead of animating every element's colours.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) return <div className="size-9" />; // same footprint, no layout shift

  const isDark = resolvedTheme === "dark";

  function toggle() {
    const next = isDark ? "light" : "dark";
    const apply = () => {
      // next-themes only updates <html> in an effect after re-render, which is too late for the
      // transition's "after" snapshot — so apply the class here; next-themes then sets the same one.
      const root = document.documentElement;
      root.classList.toggle("dark", next === "dark");
      root.classList.toggle("light", next === "light");
      root.style.colorScheme = next;
      setTheme(next);
    };
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="relative flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors duration-300 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {/* Sun shows in dark mode (click → light); moon in light mode (click → dark). */}
      <Sun
        className={cn(
          "absolute size-4 transition-all duration-500",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0",
        )}
      />
      <Moon
        className={cn(
          "absolute size-4 transition-all duration-500",
          isDark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
    </button>
  );
}
