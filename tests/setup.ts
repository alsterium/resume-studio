import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach } from "vitest";

// jsdom has no layout; these satisfy ProseMirror's selection scrolling only.
Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] });
Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() });
Object.defineProperty(document, "elementFromPoint", { value: () => null });

afterEach(() => {
  cleanup();
  clearMocks();
});
