import { afterEach, expect, it, vi } from "vitest";
import { submitIntake } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("requires an explicit live intake destination before sending data", async () => {
  vi.stubEnv("VITE_USE_MOCK", "false");
  vi.stubEnv("VITE_N8N_WEBHOOK_URL", "");
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await expect(submitIntake({})).rejects.toThrow("VITE_N8N_WEBHOOK_URL");
  expect(request).not.toHaveBeenCalled();
});

it("does not duplicate an intake when the response is lost", async () => {
  vi.stubEnv("VITE_USE_MOCK", "false");
  vi.stubEnv("VITE_N8N_WEBHOOK_URL", "https://example.test/intake");
  const request = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", request);
  await expect(submitIntake({})).rejects.toThrow("Failed to fetch");
  expect(request).toHaveBeenCalledTimes(1);
});
