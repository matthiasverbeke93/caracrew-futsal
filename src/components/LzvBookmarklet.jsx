import { useEffect, useMemo, useRef, useState } from "react";
import { buildLzvBookmarklet } from "../utils/lzvFill";

/**
 * Admin tab: the bookmark that fills the LZV result form from the app's stats (see utils/lzvFill.js).
 * React refuses to render a `javascript:` href, so it is set on the DOM node directly.
 */
export default function LzvBookmarklet() {
  const href = useMemo(
    () =>
      buildLzvBookmarklet({
        url: import.meta.env.VITE_SUPABASE_URL,
        key: import.meta.env.VITE_SUPABASE_ANON_KEY,
      }),
    []
  );
  const linkRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    linkRef.current?.setAttribute("href", href);
  }, [href]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-section">
      <p className="admin-hint">
        Fills the LZV result form on lzvcup.be from the app: the final score (only if LZV's box is
        empty — it warns if LZV's score differs) and, on the <b>Ploeg</b> step, who played, the
        keeper, goals and assists. It never submits; you check and press <b>Volgende</b>. The
        Fairplay step stays manual.
      </p>

      <p className="admin-section-title">Set up once</p>
      <p className="lzv-bookmarklet-row">
        <a ref={linkRef} className="lzv-bookmarklet" onClick={(e) => e.preventDefault()} draggable>
          Caracrew → LZV
        </a>
        <span className="admin-hint">Drag this to your bookmarks bar.</span>
      </p>
      <p className="admin-hint">
        Can&apos;t drag (phone)? Make any bookmark, edit it, and paste this as its address:{" "}
        <button type="button" className="admin-btn" onClick={copy}>
          {copied ? "Copied" : "Copy bookmark code"}
        </button>
      </p>

      <p className="admin-section-title">After each game</p>
      <ol className="admin-hint lzv-bookmarklet-steps">
        <li>Enter goals, assists, Played and keeper on the Stats tab of the match.</li>
        <li>Open the match on lzvcup.be → My team → TODO, and click the bookmark on the score step.</li>
        <li>Press Volgende, click the bookmark again on the Ploeg step, check the green rows.</li>
        <li>Anyone listed as &quot;not on the LZV team list&quot; (guests, name mismatches) is left for you.</li>
      </ol>
    </div>
  );
}
