"use client";

import Swal from "sweetalert2";

// SweetAlert2 for confirmations and blocking error/success popups;
// use Sonner (`toast`) for quick background feedback.

const LIGHT = { primary: "#0F766E", danger: "#EF4444", neutral: "#64748B" };
// Obsidian + Teal (globals.css .dark); confirm text is made dark there for contrast on the bright teal.
const DARK = { primary: "#2DD4BF", danger: "#F87171", neutral: "#2A2D3A" };

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/** Popup surface + button colours for the current theme, read when each popup opens. */
function themed() {
  const dark = isDark();
  return {
    colors: dark ? DARK : LIGHT,
    base: dark
      ? ({ theme: "dark", background: "#13151C", color: "#E8EAF0" } as const)
      : ({ theme: "light" } as const),
  };
}

export async function confirmDanger(options: {
  title: string;
  text: string;
  confirmText?: string;
}): Promise<boolean> {
  const { colors, base } = themed();
  const result = await Swal.fire({
    ...base,
    icon: "warning",
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Delete",
    cancelButtonText: "Cancel",
    confirmButtonColor: colors.danger,
    cancelButtonColor: colors.neutral,
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}

export async function confirmAction(options: { title: string; text: string; confirmText?: string }): Promise<boolean> {
  const { colors, base } = themed();
  const result = await Swal.fire({
    ...base,
    icon: "question",
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Continue",
    confirmButtonColor: colors.primary,
    cancelButtonColor: colors.neutral,
    reverseButtons: true,
  });
  return result.isConfirmed;
}

export function showError(message: string, title = "Something went wrong"): void {
  const { colors, base } = themed();
  void Swal.fire({ ...base, icon: "error", title, text: message, confirmButtonColor: colors.primary });
}

export function showWarning(message: string, title = "Please check"): void {
  const { colors, base } = themed();
  void Swal.fire({ ...base, icon: "warning", title, text: message, confirmButtonColor: colors.primary });
}

/** Asks for a required reason (e.g. rejection, cancellation). Returns null when dismissed. */
export async function promptReason(options: {
  title: string;
  text?: string;
  placeholder?: string;
  confirmText?: string;
  danger?: boolean;
}): Promise<string | null> {
  const { colors, base } = themed();
  const result = await Swal.fire({
    ...base,
    icon: options.danger ? "warning" : "question",
    title: options.title,
    text: options.text,
    input: "textarea",
    inputPlaceholder: options.placeholder ?? "Reason…",
    inputAttributes: { "aria-label": options.placeholder ?? "Reason" },
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? "Submit",
    confirmButtonColor: options.danger ? colors.danger : colors.primary,
    cancelButtonColor: colors.neutral,
    reverseButtons: true,
    inputValidator: (value) => (!value || value.trim().length < 3 ? "Please give a reason (at least 3 characters)" : null),
  });
  return result.isConfirmed ? String(result.value).trim() : null;
}
