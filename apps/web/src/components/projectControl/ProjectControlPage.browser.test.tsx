import { describe, expect, it, vi } from "vite-plus/test";

import { isAppModalPage } from "../sidebar/mainAppLocation";
import { createUnavailableT3HostAdapter } from "./T3HostAdapter";

describe("project control host boundary", () => {
  it("refuses portfolio reads without contacting a backend or providing fallback data", async () => {
    using fetch = vi.spyOn(globalThis, "fetch");
    const host = createUnavailableT3HostAdapter("dark", {
      canOpenThread: () => false,
      openThread: () => {},
    });
    await expect(host.readPortfolio(new AbortController().signal)).rejects.toThrow(
      "backend_unavailable",
    );
    const aborted = new AbortController();
    aborted.abort();
    await expect(host.readPortfolio(aborted.signal)).rejects.toThrow("request_cancelled");
    expect(fetch).not.toHaveBeenCalled();
    expect(host.binding.t3EnvironmentId).toBeNull();
  });

  it("only navigates explicitly scoped links to known threads", () => {
    const opened: string[] = [];
    const host = createUnavailableT3HostAdapter("light", {
      canOpenThread: (ref) => ref.environmentId === "known-env" && ref.threadId === "known-thread",
      openThread: (ref) => opened.push(`${ref.environmentId}/${ref.threadId}`),
    });
    host.openThread?.("<t3-thread://v2/known-env/known-thread>");
    host.openThread?.("t3-thread://v2/other-env/known-thread");
    host.openThread?.("t3-thread://v2/known-env/missing-thread");
    host.openThread?.("t3-thread://v1/known-thread");
    host.openThread?.("javascript:alert(1)");
    expect(opened).toEqual(["known-env/known-thread"]);
  });

  it("classifies only the exact panel path as an app modal", () => {
    expect(isAppModalPage("/project-control")).toBe(true);
    expect(isAppModalPage("/project-control-other")).toBe(false);
    expect(isAppModalPage("/project-control/nested")).toBe(false);
  });
});
