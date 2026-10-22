import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// The debug viewer pulls in the whole card database; load it only on /debug.
const DebugViewer = lazy(() =>
  import("./debug/DebugViewer").then((m) => ({ default: m.DebugViewer })),
);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    {window.location.pathname.startsWith("/debug") ? (
      <Suspense fallback={<p>Loading debug viewer…</p>}>
        <DebugViewer />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
