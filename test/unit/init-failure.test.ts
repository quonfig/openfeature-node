// Init-failure -> OpenFeature provider status mapping (qfg-9p4i.12, design
// project/plans/2026-10-05-init-failure-design.md section B.5).
//
// | SDK mode               | initialize          | status    | on heal        |
// | fail                   | throws              | ERROR     | PROVIDER_READY |
// | wait                   | blocks              | NOT_READY | resolves=READY |
// | continue, no cache     | resolves + ERROR ev | ERROR     | PROVIDER_READY |
//
// sdk-node is a server SDK with no last-known-good cache, so the
// "continue + cache -> STALE" row does not apply here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ErrorCode,
  OpenFeature,
  ProviderEvents,
  ProviderStatus,
  StandardResolutionReasons,
} from "@openfeature/server-sdk";
import { QuonfigProvider } from "../../src/provider.js";

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void };
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let ready = false;
let healed: Deferred;

const mockClient = {
  init: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  isReady: vi.fn(() => ready),
  waitForReady: vi.fn(() => healed.promise),
  getBoolDetails: vi.fn(),
  getStringDetails: vi.fn(),
  getNumberDetails: vi.fn(),
  getStringListDetails: vi.fn(),
  getJSONDetails: vi.fn(),
};

vi.mock("@quonfig/node", () => ({
  Quonfig: vi.fn(function () {
    return mockClient;
  }),
}));

/** Let the provider's deferred (macrotask) status event fire. */
const tick = () => new Promise((r) => setTimeout(r, 5));

function heal() {
  ready = true;
  healed.resolve();
}

describe("init failure -> provider status (B.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ready = false;
    healed = deferred();
    mockClient.close.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
  });

  describe("onInitFailure=fail", () => {
    beforeEach(() => {
      mockClient.init.mockRejectedValue(new Error("init failed: no config after 10.0s"));
    });

    it("initialize throws, status ERROR, client kept alive", async () => {
      const provider = new QuonfigProvider({ sdkKey: "k", onInitFailure: "fail" });
      await expect(OpenFeature.setProviderAndWait(provider)).rejects.toThrow("init failed");
      expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);
      expect(mockClient.close).not.toHaveBeenCalled();
    });

    it("emits PROVIDER_READY on heal, so the status becomes READY", async () => {
      const provider = new QuonfigProvider({ sdkKey: "k" });
      const onReady = vi.fn();
      provider.events.addHandler(ProviderEvents.Ready, onReady);
      await expect(OpenFeature.setProviderAndWait(provider)).rejects.toThrow();

      heal();
      await tick();
      expect(onReady).toHaveBeenCalledTimes(1);
      expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
    });

    it("does not emit PROVIDER_READY when the client closes before healing", async () => {
      const provider = new QuonfigProvider({ sdkKey: "k" });
      const onReady = vi.fn();
      provider.events.addHandler(ProviderEvents.Ready, onReady);
      await expect(provider.initialize()).rejects.toThrow();

      healed.reject(new Error("waitForReady: the client was closed"));
      await provider.shutdown();
      await tick();
      expect(onReady).not.toHaveBeenCalled();
    });
  });

  describe("onInitFailure=continue, no cache", () => {
    beforeEach(() => {
      mockClient.init.mockResolvedValue(undefined);
      ready = false;
    });

    it("initialize resolves, then emits a non-fatal PROVIDER_ERROR -> status ERROR", async () => {
      const provider = new QuonfigProvider({ sdkKey: "k", onInitFailure: "continue" });
      const onError = vi.fn();
      provider.events.addHandler(ProviderEvents.Error, onError);
      await OpenFeature.setProviderAndWait(provider);
      await tick();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]?.errorCode).not.toBe(ErrorCode.PROVIDER_FATAL);
      expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);
    });

    it("evaluations still run while ERROR and report PROVIDER_NOT_READY", async () => {
      mockClient.getBoolDetails.mockReturnValue({
        value: undefined,
        reason: "ERROR",
        errorCode: "PROVIDER_NOT_READY",
        errorMessage: "not ready",
      });
      const provider = new QuonfigProvider({ sdkKey: "k", onInitFailure: "continue" });
      await OpenFeature.setProviderAndWait(provider);
      await tick();
      const details = await OpenFeature.getClient().getBooleanDetails("f", true);
      expect(mockClient.getBoolDetails).toHaveBeenCalled();
      expect(details.value).toBe(true);
      expect(details.reason).toBe(StandardResolutionReasons.ERROR);
      expect(details.errorCode).toBe(ErrorCode.PROVIDER_NOT_READY);
    });

    it("emits PROVIDER_READY on heal", async () => {
      const provider = new QuonfigProvider({ sdkKey: "k", onInitFailure: "continue" });
      await OpenFeature.setProviderAndWait(provider);
      await tick();
      expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);

      heal();
      await tick();
      expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
    });
  });

  describe("healthy init", () => {
    it("stays READY and emits no PROVIDER_ERROR", async () => {
      mockClient.init.mockImplementation(async () => {
        ready = true;
      });
      const provider = new QuonfigProvider({ sdkKey: "k" });
      const onError = vi.fn();
      provider.events.addHandler(ProviderEvents.Error, onError);
      await OpenFeature.setProviderAndWait(provider);
      await tick();
      expect(onError).not.toHaveBeenCalled();
      expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
    });
  });

  describe("onInitFailure=wait", () => {
    it("is NOT_READY while initialize blocks, READY once it resolves", async () => {
      const blocking = deferred();
      mockClient.init.mockReturnValue(blocking.promise);
      const provider = new QuonfigProvider({ sdkKey: "k", onInitFailure: "wait" });
      OpenFeature.setProvider(provider);
      const client = OpenFeature.getClient();
      expect(client.providerStatus).toBe(ProviderStatus.NOT_READY);
      const details = await client.getBooleanDetails("f", true);
      expect(details.errorCode).toBe(ErrorCode.PROVIDER_NOT_READY);
      expect(mockClient.getBoolDetails).not.toHaveBeenCalled();

      ready = true;
      blocking.resolve();
      await tick();
      expect(client.providerStatus).toBe(ProviderStatus.READY);
    });
  });

  it("passes onInitFailure and initTimeout through to the wrapped client", async () => {
    const { Quonfig } = await import("@quonfig/node");
    new QuonfigProvider({ sdkKey: "k", onInitFailure: "continue", initTimeout: 2500 });
    expect(Quonfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ onInitFailure: "continue", initTimeout: 2500 })
    );
  });
});
