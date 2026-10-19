export type FormRisk = "none" | "external" | "backend";

export interface FormCheckResult {
  hasForm: boolean;
  risk: FormRisk;
  details: string;
}

// URIs that indicate the form submits somewhere external (not our backend)
const EXTERNAL_URI_RE = /^(https?:\/\/|mailto:|tel:|\/\/)/i;

/**
 * Inspects HTML (and optionally JS asset contents) to detect forms and
 * classify their backend risk.
 *
 * Never throws — returns risk='none' with details='detection error' on any exception.
 */
export function detectBackendForm(
  html: string,
  assetContents: string[] = [],
): FormCheckResult {
  try {
    // 1. Detect form presence in HTML
    const hasFormTag = /<form[\s>/]/i.test(html);
    const hasOnSubmitInHtml = /\bonSubmit\b/.test(html);
    const hasOnSubmitInJs = assetContents.some((s) => /\bonSubmit\b/.test(s));
    const hasForm = hasFormTag || hasOnSubmitInHtml || hasOnSubmitInJs;

    if (!hasForm) return { hasForm: false, risk: "none", details: "No form detected" };

    // 2. Extract form action attributes
    const actionRe = /<form[^>]*\baction=["']([^"']+)["']/gi;
    const actions: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = actionRe.exec(html)) !== null) actions.push(m[1]);

    // 3. Classify by action
    for (const action of actions) {
      if (!EXTERNAL_URI_RE.test(action)) {
        return { hasForm: true, risk: "backend", details: `Form action points to same-origin path: ${action}` };
      }
    }

    // 4. Form with no action attribute → posts to current page → backend
    if (hasFormTag && actions.length === 0) {
      return { hasForm: true, risk: "backend", details: "Form has no action attribute — posts to current page" };
    }

    // 5. Scan first 3 JS bundles (up to 100 KB each) for backend API patterns
    for (const content of assetContents.slice(0, 3)) {
      const sample = content.slice(0, 100_000);
      if (/supabase/i.test(sample)) {
        return { hasForm: true, risk: "backend", details: "JS asset references Supabase client" };
      }
      if (/fetch\s*\(\s*["'`]\/api/.test(sample)) {
        return { hasForm: true, risk: "backend", details: "JS asset calls fetch('/api...)" };
      }
      if (/axios\s*\.\w+\s*\(\s*["'`]\/api/.test(sample)) {
        return { hasForm: true, risk: "backend", details: "JS asset calls axios to /api..." };
      }
    }

    // All actions are absolute external URIs and no backend JS detected
    const actionSummary = actions[0] ?? "external";
    return { hasForm: true, risk: "external", details: `Form with external action: ${actionSummary}` };
  } catch {
    return { hasForm: false, risk: "none", details: "detection error" };
  }
}
