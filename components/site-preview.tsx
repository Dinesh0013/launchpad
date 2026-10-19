"use client";

import { useEffect, useState } from "react";

const MAX_PREVIEW_CHARS = 2 * 1024 * 1024;
const DEBOUNCE_MS = 300;

/**
 * Looks for at least one HTML tag. Browsers render almost any input, so this is
 * only a hint shown to the user — it never blocks rendering.
 */
function looksLikeHtml(source: string): boolean {
  return /<\s*[a-z!][^>]*>/i.test(source);
}

/**
 * Live preview of user-supplied HTML.
 *
 * The code is rendered with `srcDoc` inside a sandboxed iframe. Omitting
 * `allow-same-origin` gives the page an opaque origin, so pasted scripts can run
 * but cannot read this app's cookies, storage or session.
 */
export default function SitePreview({ html }: { html: string }) {
  const [rendered, setRendered] = useState(html);

  // Debounce so the iframe is not reloaded on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setRendered(html), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [html]);

  const isEmpty = rendered.trim().length === 0;
  const tooLarge = rendered.length > MAX_PREVIEW_CHARS;

  return (
    <div className="flex flex-col h-full min-h-[24rem] border border-zinc-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">Live preview</span>
        {!isEmpty && !tooLarge && !looksLikeHtml(rendered) && (
          <span className="text-amber-600">This doesn&apos;t look like HTML</span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center p-6 text-sm text-zinc-400 text-center">
          Paste your HTML on the left and your page will appear here.
        </div>
      ) : tooLarge ? (
        <div className="flex-1 flex items-center justify-center p-6 text-sm text-red-500 text-center">
          Preview unavailable — the code is larger than 2 MB.
        </div>
      ) : (
        <iframe
          title="Website preview"
          data-testid="site-preview"
          srcDoc={rendered}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          referrerPolicy="no-referrer"
          className="flex-1 w-full bg-white"
        />
      )}
    </div>
  );
}
