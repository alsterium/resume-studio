import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, vi } from "vitest";

// UI integration replaces only the native event subscription. Desktop E2E uses it directly.
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  value: function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  value: function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  },
});

// jsdom has no layout; these satisfy ProseMirror's selection scrolling only.
Object.defineProperty(Range.prototype, "getClientRects", { value: () => [] });
Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect() });
Object.defineProperty(document, "elementFromPoint", { value: () => null });

afterEach(() => {
  cleanup();
  clearMocks();
});
