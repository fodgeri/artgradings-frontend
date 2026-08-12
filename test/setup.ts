import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// With `globals: false` there is no ambient `afterEach` for React Testing
// Library to hook into, so its automatic cleanup never registers. Without
// this, the DOM rendered by one test survives into the next and `screen`
// queries match stale nodes — usually surfacing as a confusing
// "found multiple elements" failure in an unrelated test.
afterEach(() => {
  cleanup();
});
