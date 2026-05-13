import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.stubEnv("NODE_ENV", "development");

afterEach(() => {
  cleanup();
});
