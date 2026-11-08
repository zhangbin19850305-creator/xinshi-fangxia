import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANALYTICS_EVENTS,
  FIRST_VISIT_KEY,
  LAST_VISIT_KEY,
  PAGE_TITLE,
  UMAMI_SCRIPT_SRC,
  localDateString,
  mountUmamiScript,
  noteReturnVisit,
  readWebsiteId,
  sanitizeUmamiPayload,
  sendCount,
  umamiScriptAttributes,
  type DateStorage,
} from "../src/analytics.ts";

const WEBSITE_ID = "94db1cb1-74f4-4a40-ad6c-962362670409";
const INPUT = "心事正文-UNIQUE-不要上报这段话";

function memoryStorage(initial: Record<string, string> = {}): DateStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

test("track is called with only the event name and no input text", () => {
  const calls: unknown[][] = [];
  const trackFn = (...args: unknown[]) => {
    calls.push(args);
  };
  const length = INPUT.length;
  const snippet = INPUT.slice(0, 4);

  for (const name of ANALYTICS_EVENTS) {
    sendCount(trackFn, name);
  }
  sendCount(undefined, "submit_put");

  assert.deepEqual(
    calls.map((args) => args[0]),
    [...ANALYTICS_EVENTS],
  );
  for (const args of calls) {
    assert.equal(args.length, 1);
    assert.equal(typeof args[0], "string");
  }
  const serialized = JSON.stringify(calls);
  assert.equal(serialized.includes(INPUT), false);
  assert.equal(serialized.includes(snippet), false);
  assert.equal(serialized.includes(String(length)), false);
  assert.equal(serialized.includes("data"), false);
});

test("before send drops input text, length, title, url query, and event data", () => {
  const payload = {
    website: WEBSITE_ID.toUpperCase(),
    hostname: "zhangbin19850305-creator.github.io",
    language: "zh-CN",
    screen: "390x844",
    title: INPUT,
    url: `/xinshi-fangxia/put?q=${encodeURIComponent(INPUT)}&length=${INPUT.length}`,
    referrer: `https://ref.example/path/${encodeURIComponent(INPUT)}?text=${encodeURIComponent(INPUT)}`,
    name: "submit_put",
    id: INPUT,
    tag: INPUT,
    data: {
      text: INPUT,
      length: INPUT.length,
      snippet: INPUT.slice(0, 4),
    },
  };

  const result = sanitizeUmamiPayload("event", payload, {
    base: "/xinshi-fangxia/",
    pathname: "/xinshi-fangxia/put",
  });

  assert.notEqual(result, false);
  const body = JSON.stringify(result);
  assert.equal(body.includes(INPUT), false);
  assert.equal(body.includes("UNIQUE"), false);
  assert.equal(body.includes(`"length"`), false);
  assert.equal(body.includes("snippet"), false);
  assert.deepEqual(result, {
    website: WEBSITE_ID,
    hostname: "zhangbin19850305-creator.github.io",
    language: "zh-CN",
    screen: "390x844",
    title: PAGE_TITLE,
    url: "/xinshi-fangxia/put",
    name: "submit_put",
    referrer: "https://ref.example",
  });
  assert.equal("data" in (result as object), false);
});

test("return visit url stays on a known route when the path contains text", () => {
  const result = sanitizeUmamiPayload(
    "event",
    {
      website: WEBSITE_ID,
      name: "return_visit",
      url: `/xinshi-fangxia/${encodeURIComponent(INPUT)}?q=${encodeURIComponent(INPUT)}`,
      title: INPUT,
      data: { text: INPUT },
    },
    {
      base: "/xinshi-fangxia/",
      pathname: `/xinshi-fangxia/put/${INPUT}`,
    },
  );
  assert.deepEqual(result, {
    website: WEBSITE_ID,
    name: "return_visit",
    url: "/xinshi-fangxia/",
    title: PAGE_TITLE,
  });
});

test("pageviews, unknown events, and identify calls are cancelled", () => {
  const dirty = {
    website: WEBSITE_ID,
    url: `/?q=${encodeURIComponent(INPUT)}`,
    title: INPUT,
    data: { text: INPUT },
  };
  assert.equal(sanitizeUmamiPayload("event", dirty), false);
  assert.equal(sanitizeUmamiPayload("event", { ...dirty, name: "typed_text" }), false);
  assert.equal(sanitizeUmamiPayload("identify", { ...dirty, name: "view_home" }), false);
  assert.equal(sanitizeUmamiPayload("event", { name: "view_home", website: INPUT }), false);
});

test("return visit stores only dates", () => {
  const storage = memoryStorage({ [FIRST_VISIT_KEY]: INPUT, [LAST_VISIT_KEY]: INPUT });
  assert.equal(noteReturnVisit(storage, "2026-11-08"), "first");
  assert.deepEqual([...storage.data.keys()].sort(), [FIRST_VISIT_KEY, LAST_VISIT_KEY]);
  assert.equal(storage.data.get(FIRST_VISIT_KEY), "2026-11-08");
  assert.equal(storage.data.get(LAST_VISIT_KEY), "2026-11-08");
  assert.equal(noteReturnVisit(storage, "2026-11-08"), "same-day");
  storage.setItem(LAST_VISIT_KEY, INPUT);
  assert.equal(noteReturnVisit(storage, "2026-11-08"), "same-day");
  assert.equal(storage.data.get(LAST_VISIT_KEY), "2026-11-08");

  assert.equal(noteReturnVisit(storage, "2026-11-09"), "return");
  assert.equal(storage.data.get(FIRST_VISIT_KEY), "2026-11-08");
  assert.equal(storage.data.get(LAST_VISIT_KEY), "2026-11-09");
  assert.equal(noteReturnVisit(storage, "2026-11-09"), "same-day");

  for (const value of storage.data.values()) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(value.includes(INPUT), false);
  }
});

test("localStorage failures and invalid dates are skipped", () => {
  const throwing: DateStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(noteReturnVisit(null, "2026-11-08"), "skipped");
  assert.equal(noteReturnVisit(undefined, "2026-11-08"), "skipped");
  assert.equal(noteReturnVisit(throwing, "2026-11-08"), "skipped");
  assert.equal(noteReturnVisit(memoryStorage(), INPUT), "skipped");
  assert.equal(localDateString(new Date(2026, 10, 8)), "2026-11-08");
});

test("missing or malformed website id does not load the script", () => {
  for (const value of [undefined, null, "", "   ", INPUT, "not-a-uuid", `${WEBSITE_ID}?${INPUT}`]) {
    assert.equal(readWebsiteId(value), null);
  }
  assert.equal(readWebsiteId(`  ${WEBSITE_ID.toUpperCase()}  `), WEBSITE_ID);
});

test("script tag disables automatic pageviews and does not carry typed text", () => {
  const attributes = umamiScriptAttributes(WEBSITE_ID);
  assert.equal(attributes.src, UMAMI_SCRIPT_SRC);
  assert.equal(attributes["data-auto-pageview"], "false");
  assert.equal(attributes["data-exclude-search"], "true");
  assert.equal(attributes["data-exclude-hash"], "true");
  assert.equal(attributes["data-do-not-track"], "true");
  assert.equal("data-auto-track" in attributes, false);
  const serialized = JSON.stringify(attributes);
  assert.equal(serialized.includes(INPUT), false);

  const created: Array<{
    src: string;
    attrs: Record<string, string>;
    setAttribute(name: string, value: string): void;
  }> = [];
  const doc = {
    head: {
      appendChild(node: (typeof created)[number]) {
        created.push(node);
      },
    },
    createElement() {
      const attrs: Record<string, string> = {};
      return {
        src: "",
        defer: false,
        async: false,
        attrs,
        setAttribute(name: string, value: string) {
          attrs[name] = value;
        },
        addEventListener() {},
      };
    },
    querySelector() {
      return created.length > 0 ? created[0] : null;
    },
  };
  const first = mountUmamiScript(doc, WEBSITE_ID);
  const second = mountUmamiScript(doc, WEBSITE_ID);
  assert.equal(second, null);
  assert.ok(first);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.src, UMAMI_SCRIPT_SRC);
  assert.equal(created[0]?.attrs["data-website-id"], WEBSITE_ID);
  assert.equal(JSON.stringify(created[0]?.attrs).includes(INPUT), false);
});

test("app call sites pass event names only", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const analytics = readFileSync(new URL("../src/analytics.ts", import.meta.url), "utf8");
  const calls = [...app.matchAll(/\btrack\(([^)]*)\)/g)].map((match) => match[1]?.trim());
  assert.deepEqual(calls.sort(), [
    '"return_visit"',
    '"submit_put"',
    '"view_home"',
    '"view_put"',
  ]);
  assert.match(analytics, /trackFn\(name\)/);
  assert.doesNotMatch(analytics, /trackFn\(\s*name\s*,/);
  assert.doesNotMatch(analytics, /umami\.track\?\.\(\s*eventName\s*,/);
  assert.equal(app.includes("localStorage"), false);
  assert.equal(analytics.includes("document.cookie"), false);
});
