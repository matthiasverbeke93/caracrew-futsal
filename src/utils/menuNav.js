const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

/** On open, move focus to the checked item (or the first item) of a menu container. */
export function focusInitialMenuItem(container) {
  if (!container) return;
  const active = container.querySelector('[aria-checked="true"]');
  (active || container.querySelector(ITEM_SELECTOR))?.focus();
}

/**
 * Roving Arrow/Home/End navigation for a `role="menu"` container.
 * Attach as the container's `onKeyDown`. (Escape/outside-click are handled by the caller.)
 */
export function handleMenuArrowKeys(e) {
  const items = Array.from(e.currentTarget.querySelectorAll(ITEM_SELECTOR));
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    items[(idx + 1) % items.length].focus();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    items[(idx - 1 + items.length) % items.length].focus();
  } else if (e.key === "Home") {
    e.preventDefault();
    items[0].focus();
  } else if (e.key === "End") {
    e.preventDefault();
    items[items.length - 1].focus();
  }
}
