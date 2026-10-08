import "@testing-library/jest-dom";

// jsdom has no layout, so ResizeObserver doesn't exist; a no-op keeps the
// card grid at one column in tests.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
