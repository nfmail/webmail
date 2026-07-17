import { toast as sonnerToast } from "sonner";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message?: string;
  action?: ToastAction;
  duration?: number;
}

// Preserve the historical durations of the previous in-house toast queue so
// migrating to sonner does not change how long messages stay on screen.
const DEFAULT_DURATION = 5000;
const ERROR_DURATION = 10000;

function mapAction(action?: ToastAction) {
  if (!action) return undefined;
  // sonner's action.onClick receives the click event; our callers take no
  // arguments, so wrap to keep the public signature stable and drop the event.
  return {
    label: action.label,
    onClick: () => action.onClick(),
  };
}

function showToast(
  type: ToastType,
  title: string,
  options?: string | ToastOptions,
  defaultDuration: number = DEFAULT_DURATION,
): string | number {
  const opts = typeof options === "string" ? { message: options } : options;
  const data = {
    description: opts?.message,
    duration: opts?.duration ?? defaultDuration,
    action: mapAction(opts?.action),
  };

  switch (type) {
    case "success":
      return sonnerToast.success(title, data);
    case "error":
      return sonnerToast.error(title, data);
    case "warning":
      return sonnerToast.warning(title, data);
    case "info":
    default:
      return sonnerToast.info(title, data);
  }
}

/**
 * App-wide toast API. This is a thin adapter over `sonner` that preserves the
 * `toast.success(title, options)` shape the codebase already depends on, so
 * existing call sites keep working unchanged. `options` may be a plain string
 * (used as the description) or a `ToastOptions` object.
 */
export const toast = {
  success: (title: string, options?: string | ToastOptions) =>
    showToast("success", title, options),
  error: (title: string, options?: string | ToastOptions) =>
    showToast("error", title, options, ERROR_DURATION),
  info: (title: string, options?: string | ToastOptions) =>
    showToast("info", title, options),
  warning: (title: string, options?: string | ToastOptions) =>
    showToast("warning", title, options),
};

/** Dismiss a toast by id, or all toasts when no id is given. */
export function dismissToast(id?: string | number): void {
  sonnerToast.dismiss(id);
}
