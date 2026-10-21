import {
  ErrorCode,
  EvaluationContext,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
} from "@openfeature/server-sdk";
import { EvaluationDetails, Quonfig, QuonfigOptions } from "@quonfig/node";
import { mapContext } from "./context.js";

export interface QuonfigProviderOptions extends Omit<QuonfigOptions, "onConfigUpdate"> {
  /**
   * Dot-notation path to map OpenFeature's `targetingKey` into Quonfig's nested context.
   * Defaults to "user.id".
   */
  targetingKeyMapping?: string;
}

/**
 * QuonfigProvider wraps the @quonfig/node native SDK and implements the
 * OpenFeature server-side Provider interface.
 *
 * Usage:
 * ```typescript
 * import { QuonfigProvider } from "@quonfig/openfeature-node";
 * import { OpenFeature } from "@openfeature/server-sdk";
 *
 * const provider = new QuonfigProvider({ sdkKey: "qf_sk_..." });
 * await OpenFeature.setProviderAndWait(provider);
 * const client = OpenFeature.getClient();
 * const enabled = await client.getBooleanValue("my-flag", false);
 * ```
 */
export class QuonfigProvider implements Provider {
  readonly metadata = { name: "quonfig" } as const;
  readonly events = new OpenFeatureEventEmitter();
  readonly hooks = [];

  private readonly client: Quonfig;
  private readonly targetingKeyMapping: string;

  constructor(options: QuonfigProviderOptions) {
    this.targetingKeyMapping = options.targetingKeyMapping ?? "user.id";
    this.client = new Quonfig({
      ...options,
      onConfigUpdate: () => {
        this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [] });
      },
    });
  }

  /**
   * Initialize the wrapped client. Status follows the client's `onInitFailure`
   * (design B.5), which you pass in the provider options with `initTimeout`:
   *
   * - `"fail"` (default): `init()` rejects, so this throws and the provider is
   *   ERROR. The client is kept alive and retries in the background; on heal the
   *   provider emits PROVIDER_READY.
   * - `"wait"`: blocks until the first config, so the provider is NOT_READY
   *   throughout and READY when it resolves.
   * - `"continue"`: resolves on code defaults, then emits a non-fatal
   *   PROVIDER_ERROR so the status is ERROR (evaluations still run and return
   *   the caller default). On heal the provider emits PROVIDER_READY.
   */
  async initialize(_context?: EvaluationContext): Promise<void> {
    try {
      await this.client.init();
    } catch (err) {
      this.emitReadyOnHeal();
      throw err;
    }
    if (!this.client.isReady()) {
      // OpenFeature marks the provider READY once initialize() resolves, so
      // report the error after that has happened.
      setTimeout(() => {
        if (this.client.isReady()) return;
        this.events.emit(ProviderEvents.Error, {
          message: "[quonfig] no config loaded (onInitFailure=continue): serving code defaults",
          errorCode: ErrorCode.PROVIDER_NOT_READY,
        });
      }, 0);
      this.emitReadyOnHeal();
    }
  }

  /** Emit PROVIDER_READY once the client's background retry loads config. */
  private emitReadyOnHeal(): void {
    this.client.waitForReady().then(
      () => this.events.emit(ProviderEvents.Ready),
      () => {} // closed before healing
    );
  }

  async shutdown(): Promise<void> {
    await this.client.close();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger
  ): Promise<ResolutionDetails<boolean>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getBoolDetails(flagKey, mappedCtx);
    return toResolutionDetails(details, defaultValue);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger
  ): Promise<ResolutionDetails<string>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getStringDetails(flagKey, mappedCtx);
    return toResolutionDetails(details, defaultValue);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger
  ): Promise<ResolutionDetails<number>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getNumberDetails(flagKey, mappedCtx);
    return toResolutionDetails(details, defaultValue);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger
  ): Promise<ResolutionDetails<T>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    // Try string_list first (returns string[]), fall back to JSON.
    const listDetails = this.client.getStringListDetails(flagKey, mappedCtx);
    if (
      listDetails.reason === "STATIC" ||
      listDetails.reason === "TARGETING_MATCH" ||
      listDetails.reason === "SPLIT"
    ) {
      return toResolutionDetails(
        listDetails as EvaluationDetails<unknown> as EvaluationDetails<T>,
        defaultValue
      );
    }
    const jsonDetails = this.client.getJSONDetails(flagKey, mappedCtx);
    return toResolutionDetails(jsonDetails as EvaluationDetails<T>, defaultValue);
  }

  /**
   * Escape hatch: access the underlying @quonfig/node client for native-only features
   * (shouldLog, keys, rawConfig, etc.)
   */
  getClient(): Quonfig {
    return this.client;
  }
}

/**
 * Translate a Quonfig EvaluationDetails<T> into an OpenFeature ResolutionDetails<T>.
 *
 * Reason mapping (from the brief):
 *   STATIC           → StandardResolutionReasons.STATIC
 *   TARGETING_MATCH  → StandardResolutionReasons.TARGETING_MATCH
 *   SPLIT            → StandardResolutionReasons.SPLIT
 *   DEFAULT          → defaultValue + StandardResolutionReasons.DEFAULT
 *   ERROR            → defaultValue + ERROR + errorCode (FLAG_NOT_FOUND / TYPE_MISMATCH /
 *                      PROVIDER_NOT_READY / GENERAL)
 */
function toResolutionDetails<T>(
  details: EvaluationDetails<T>,
  defaultValue: T
): ResolutionDetails<T> {
  const common = {
    variant: details.variant,
    flagMetadata: details.flagMetadata as ResolutionDetails<T>["flagMetadata"],
  };
  switch (details.reason) {
    case "STATIC":
      return {
        value: details.value as T,
        reason: StandardResolutionReasons.STATIC,
        ...common,
      };
    case "TARGETING_MATCH":
      return {
        value: details.value as T,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        ...common,
      };
    case "SPLIT":
      return {
        value: details.value as T,
        reason: StandardResolutionReasons.SPLIT,
        ...common,
      };
    case "DEFAULT":
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
        ...common,
      };
    case "ERROR":
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toOFErrorCode(details.errorCode),
        errorMessage: details.errorMessage,
        ...common,
      };
  }
}

function toOFErrorCode(code: EvaluationDetails<unknown>["errorCode"]): ErrorCode {
  switch (code) {
    case "FLAG_NOT_FOUND":
      return ErrorCode.FLAG_NOT_FOUND;
    case "TYPE_MISMATCH":
      return ErrorCode.TYPE_MISMATCH;
    case "PROVIDER_NOT_READY":
      return ErrorCode.PROVIDER_NOT_READY;
    case "GENERAL":
    default:
      return ErrorCode.GENERAL;
  }
}
