/**
 * Count-only Umami events.
 * track() accepts an event name and nothing else. xfBeforeSend drops every
 * other text field before a request can leave the browser.
 */

export const ANALYTICS_EVENTS = [
  "view_home",
  "view_put",
  "submit_put",
  "return_visit",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const FIRST_VISIT_KEY = "xf_first";
export const LAST_VISIT_KEY = "xf_last";
export const UMAMI_SCRIPT_SRC = "https://cloud.umami.is/script.js";
export const BEFORE_SEND_NAME = "xfBeforeSend";
export const PAGE_TITLE = "把心事轻轻放下";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_RE = /^[a-z0-9.-]+$/i;
const LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const SCREEN_RE = /^\d{2,5}x\d{2,5}$/;

export type SanitizeContext = {
  base: string;
  pathname: string;
};

function withBase(base: string, route: "/" | "/put" | "/after"): string {
  const trimmed = base.replace(/\/$/, "");
  if (route === "/") return trimmed === "" ? "/" : `${trimmed}/`;
  return `${trimmed}${route}`;
}

export type VisitMark = "first" | "same-day" | "return" | "skipped";

export type DateStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type Mode = "idle" | "disabled" | "loading" | "ready";

let mode: Mode = "idle";
const pending: AnalyticsEvent[] = [];

export function isAnalyticsEvent(name: string): name is AnalyticsEvent {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}

export function readWebsiteId(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!UUID_RE.test(id)) return null;
  return id.toLowerCase();
}

export function localDateString(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function safeRoutePath(
  pathname: string,
  base: string,
): "/" | "/put" | "/after" {
  const trimmedBase = base.replace(/\/$/, "");
  let path = pathname.split("?")[0]?.split("#")[0] ?? "";
  if (trimmedBase && (path === trimmedBase || path.startsWith(`${trimmedBase}/`))) {
    path = path.slice(trimmedBase.length) || "/";
  }
  path = path.replace(/\/+$/, "") || "/";
  if (path === "/put" || path === "/after") return path;
  return "/";
}

export function referrerOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Keep a count, drop everything that could carry typed text.
 * Unknown events and non-event collections are cancelled.
 */
export function sanitizeUmamiPayload(
  type: string,
  payload: Record<string, unknown> | null | undefined,
  context: SanitizeContext = { base: "/", pathname: "/" },
): Record<string, unknown> | false {
  if (type !== "event" || !payload) return false;
  const name = payload.name;
  if (typeof name !== "string" || !isAnalyticsEvent(name)) return false;
  if (typeof payload.website !== "string" || !UUID_RE.test(payload.website)) {
    return false;
  }

  const route =
    name === "view_home"
      ? "/"
      : name === "return_visit"
        ? safeRoutePath(context.pathname, context.base)
        : "/put";

  const next: Record<string, unknown> = {
    website: payload.website.toLowerCase(),
    name,
    url: withBase(context.base, route),
    title: PAGE_TITLE,
  };

  if (typeof payload.hostname === "string" && HOST_RE.test(payload.hostname)) {
    next.hostname = payload.hostname;
  }
  if (typeof payload.language === "string" && LANG_RE.test(payload.language)) {
    next.language = payload.language;
  }
  if (typeof payload.screen === "string" && SCREEN_RE.test(payload.screen)) {
    next.screen = payload.screen;
  }
  const referrer = referrerOrigin(payload.referrer);
  if (referrer) next.referrer = referrer;
  return next;
}

export function noteReturnVisit(
  storage: DateStorage | null | undefined,
  today: string,
): VisitMark {
  if (!storage || !DATE_RE.test(today)) return "skipped";
  try {
    const first = storage.getItem(FIRST_VISIT_KEY);
    if (!first || !DATE_RE.test(first)) {
      storage.setItem(FIRST_VISIT_KEY, today);
      storage.setItem(LAST_VISIT_KEY, today);
      return "first";
    }
    const last = storage.getItem(LAST_VISIT_KEY);
    if (first === today || last === today) {
      if (last !== today) storage.setItem(LAST_VISIT_KEY, today);
      return "same-day";
    }
    storage.setItem(LAST_VISIT_KEY, today);
    return "return";
  } catch {
    return "skipped";
  }
}

export function sendCount(
  trackFn: ((eventName: string) => void) | undefined,
  name: AnalyticsEvent,
): void {
  if (!trackFn || !isAnalyticsEvent(name)) return;
  trackFn(name);
}

export function umamiScriptAttributes(websiteId: string): Record<string, string> {
  return {
    src: UMAMI_SCRIPT_SRC,
    defer: "true",
    "data-website-id": websiteId,
    "data-auto-pageview": "false",
    "data-exclude-search": "true",
    "data-exclude-hash": "true",
    "data-do-not-track": "true",
    "data-before-send": BEFORE_SEND_NAME,
  };
}

export function mountUmamiScript(doc: Document, websiteId: string): HTMLScriptElement | null {
  if (doc.querySelector("script[data-xf-umami='true']")) return null;
  const script = doc.createElement("script");
  const attributes = umamiScriptAttributes(websiteId);
  script.src = attributes.src;
  script.defer = true;
  script.async = true;
  script.setAttribute("data-xf-umami", "true");
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "src" || name === "defer") continue;
    script.setAttribute(name, value);
  }
  doc.head.appendChild(script);
  return script;
}

function viteWebsiteId(): string | undefined {
  const env = import.meta.env;
  if (!env) return undefined;
  return env.VITE_UMAMI_WEBSITE_ID;
}

function installBeforeSend(): void {
  const base = import.meta.env?.BASE_URL || "/";
  window.xfBeforeSend = (type, payload) =>
    sanitizeUmamiPayload(type, payload, {
      base,
      pathname: window.location.pathname,
    });
}

function deliver(name: AnalyticsEvent): void {
  try {
    const umami = window.umami;
    if (!umami || typeof umami.track !== "function") return;
    sendCount((eventName) => {
      umami.track?.(eventName);
    }, name);
  } catch {
    // A failed counter must not change the page.
  }
}

function flush(): void {
  if (mode !== "ready" || typeof window.umami?.track !== "function") {
    pending.length = 0;
    return;
  }
  const names = pending.splice(0, pending.length);
  for (const name of names) deliver(name);
}

export function initAnalytics(): void {
  if (mode !== "idle") return;
  const websiteId = readWebsiteId(viteWebsiteId());
  if (!websiteId || typeof document === "undefined") {
    mode = "disabled";
    pending.length = 0;
    return;
  }
  mode = "loading";
  try {
    installBeforeSend();
    const script = mountUmamiScript(document, websiteId);
    if (!script) {
      mode = "disabled";
      pending.length = 0;
      return;
    }
    script.addEventListener("load", () => {
      if (typeof window.umami?.track === "function") {
        mode = "ready";
        flush();
      } else {
        mode = "disabled";
        pending.length = 0;
      }
    });
    script.addEventListener("error", () => {
      mode = "disabled";
      pending.length = 0;
    });
  } catch {
    mode = "disabled";
    pending.length = 0;
  }
}

export function track(name: AnalyticsEvent): void {
  try {
    if (!isAnalyticsEvent(name) || mode === "disabled") return;
    if (mode === "ready" && typeof window.umami?.track === "function") {
      deliver(name);
      return;
    }
    pending.push(name);
  } catch {
    // A failed counter must not change the page.
  }
}

export function browserStorage(): DateStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    umami?: {
      track?: (eventName: string) => void;
    };
    xfBeforeSend?: (
      type: string,
      payload: Record<string, unknown> | null | undefined,
    ) => Record<string, unknown> | false;
  }
}
