import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

/**
 * Read the toast API: `notify(message, tone, duration)` and `dismiss(id)`.
 * Used mainly to surface otherwise-silent write failures (optimistic saves in
 * {@link useFutsalData} roll back on error — the user needs to know).
 * Returns a safe no-op when rendered outside a {@link ToastProvider}.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { notify: () => {}, dismiss: () => {} };
}
