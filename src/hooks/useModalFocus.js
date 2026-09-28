import { useEffect } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus handling every dialog needs: keep Tab / Shift+Tab inside it, move focus in
 * when it opens (unless the dialog already focused one of its own fields), and give
 * focus back to whatever opened it when it closes. The dialog element should carry
 * `tabIndex={-1}` so it can take focus itself when it has nothing focusable yet.
 */
export function useModalFocus(dialogRef, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;

    // After the dialog's own autofocus (if any) has run.
    const focusTimer = setTimeout(() => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    }, 0);

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !dialog.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !dialog.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [active, dialogRef]);
}
