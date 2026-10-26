import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// The theme's variables apply to every page, `/debug` included (M5g).
import "./theme.css";
import "./fonts";

// The debug viewer and the board pull in the whole card database; load them only on their routes.
const DebugViewer = lazy(() =>
  import("./debug/DebugViewer").then((m) => ({ default: m.DebugViewer })),
);
const PlayScreen = lazy(() =>
  import("./play/PlayScreen").then((m) => ({ default: m.PlayScreen })),
);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

const path = window.location.pathname;
// The menu and the board fill the window; /debug keeps the browser's default page margin.
if (!path.startsWith("/debug")) document.body.classList.add("gojisim-body");
createRoot(root).render(
  <StrictMode>
    {path.startsWith("/debug") ? (
      <Suspense fallback={<p>Loading debug viewer…</p>}>
        <DebugViewer />
      </Suspense>
    ) : path.startsWith("/play") ? (
      <Suspense fallback={<p>Loading…</p>}>
        <PlayScreen />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
