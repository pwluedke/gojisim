import { useEffect, useRef, useState } from "react";
import type { MatView } from "./BoardView";
import {
  MAT_DEFAULTS,
  type MatImage,
  matFileProblem,
  type MatStore,
  matStore,
} from "./matStore";

/**
 * The custom mat image setting (M5f): loads the saved mat once, and saves every change. When
 * storage fails, the image still shows for this page view, with a note that it wasn't saved.
 */
export function useCustomMat(store: MatStore = matStore()) {
  const [mat, setMat] = useState<MatImage | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Storage writes in flight; 0 once the stored mat matches what shows.
  const [pending, setPending] = useState(0);
  const track = (work: Promise<boolean>) => {
    setPending((n) => n + 1);
    return work.finally(() => setPending((n) => n - 1));
  };
  const storeRef = useRef(store);

  useEffect(() => {
    let live = true;
    void storeRef.current.load().then((saved) => {
      if (live && saved) setMat(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!mat) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(mat.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [mat?.blob]);

  const keep = (next: MatImage) => {
    setMat(next);
    void track(storeRef.current.save(next)).then((saved) => {
      if (!saved)
        setError(
          "This browser can't store the mat, so it lasts for this visit only.",
        );
    });
  };

  const upload = (file: File) => {
    const problem = matFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    keep({ blob: file, ...MAT_DEFAULTS });
  };

  const adjust = (change: Partial<Pick<MatImage, "scale" | "x" | "y">>) => {
    if (mat) keep({ ...mat, ...change });
  };

  const reset = () => {
    setMat(null);
    setError(null);
    void track(storeRef.current.clear());
  };

  const view: MatView | null =
    mat && url ? { url, scale: mat.scale, x: mat.x, y: mat.y } : null;
  return { mat, view, error, upload, adjust, reset, stored: pending === 0 };
}
