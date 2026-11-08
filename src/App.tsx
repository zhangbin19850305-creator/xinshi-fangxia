import { useEffect, useState } from "react";
import {
  browserStorage,
  initAnalytics,
  localDateString,
  noteReturnVisit,
  track,
} from "./analytics";

type Screen = "entry" | "put" | "after";

const paths: Record<Screen, string> = {
  entry: "/",
  put: "/put",
  after: "/after",
};

function routeUrl(screen: Screen): string {
  const route = paths[screen];
  const base = import.meta.env.BASE_URL;
  if (route === "/") return base;
  return `${base.replace(/\/$/, "")}${route}`;
}

function screenFromPath(pathname: string): Screen {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = pathname;
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length) || "/";
  }
  path = path.replace(/\/+$/, "") || "/";
  if (path === "/put") return "put";
  if (path === "/after") return "after";
  return "entry";
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    screenFromPath(window.location.pathname),
  );

  useEffect(() => {
    const onPop = () => setScreen(screenFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    initAnalytics();
    if (noteReturnVisit(browserStorage(), localDateString()) === "return") {
      track("return_visit");
    }
  }, []);

  useEffect(() => {
    // Ignore the extra StrictMode pass so a view is counted once.
    const timer = window.setTimeout(() => {
      if (screen === "entry") track("view_home");
      if (screen === "put") track("view_put");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [screen]);

  function go(next: Screen) {
    const url = routeUrl(next);
    if (window.location.pathname !== url) {
      window.history.pushState(null, "", url);
    }
    setScreen(next);
  }

  return (
    <div className="page">
      {screen === "entry" ? <Entry onPut={() => go("put")} /> : null}
      {screen === "put" ? <PutDown onPut={() => go("after")} /> : null}
      {screen === "after" ? (
        <After onLeave={() => go("entry")} onAgain={() => go("put")} />
      ) : null}
      <footer>
        <p>这里不是心理咨询或医疗服务。</p>
        <p>只统计访问次数，不记录你写的内容。</p>
      </footer>
    </div>
  );
}

function Entry({ onPut }: { onPut: () => void }) {
  return (
    <main className="panel">
      <header>
        <h1>把心事轻轻放下</h1>
        <p className="subtitle">谁都能来。不表演，不诊断。放下，就可以走。</p>
      </header>
      <div className="actions">
        <button type="button" onClick={onPut}>
          放下
        </button>
      </div>
    </main>
  );
}

function PutDown({ onPut }: { onPut: () => void }) {
  const [text, setText] = useState("");

  return (
    <main className="panel">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          track("submit_put");
          setText("");
          onPut();
        }}
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="心事"
          autoComplete="off"
          autoFocus
        />
        <div className="actions">
          <button type="submit">放下</button>
        </div>
      </form>
    </main>
  );
}

function After({ onLeave, onAgain }: { onLeave: () => void; onAgain: () => void }) {
  return (
    <main className="panel">
      <p className="after">好。放下了。你可以走了。</p>
      <div className="actions">
        <button type="button" onClick={onLeave}>
          离开
        </button>
        <button type="button" className="quiet" onClick={onAgain}>
          再放一条
        </button>
      </div>
    </main>
  );
}
