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
import { EvaluationDetails, Quonfig, QuonfigOptions, ValueType } from "@quonfig/node";
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
  private closed = false;
  private initErrorTimer?: ReturnType<typeof setTimeout>;

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
      this.initErrorTimer = setTimeout(() => {
        if (this.closed || this.client.isReady()) return;
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
      () => {
        if (!this.closed) this.events.emit(ProviderEvents.Ready);
      },
      () => {} // closed before healing
    );
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    clearTimeout(this.initErrorTimer);
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
    return this.resolve(flagKey, details, defaultValue, BOOL_TYPES);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger
  ): Promise<ResolutionDetails<string>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getStringDetails(flagKey, mappedCtx);
    return this.resolve(flagKey, details, defaultValue, STRING_TYPES);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger
  ): Promise<ResolutionDetails<number>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getNumberDetails(flagKey, mappedCtx);
    return this.resolve(flagKey, details, defaultValue, NUMBER_TYPES);
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
    return this.resolve(flagKey, jsonDetails as EvaluationDetails<T>, defaultValue, OBJECT_TYPES);
  }

  /**
   * Translate native details, telling a malformed value apart from a wrong-type
   * read (qfg-9xsl). sdk-node's `*Details` getters report both as
   * `TYPE_MISMATCH`, but a wrong-type read fails its check against the config's
   * declared `valueType` before evaluating. So a `TYPE_MISMATCH` on a config
   * whose declared type this read accepts means the value itself did not parse
   * (a stored int "twelve", an ENV_VAR int set to "twelve"): `PARSE_ERROR`.
   */
  private resolve<T>(
    flagKey: string,
    details: EvaluationDetails<T>,
    defaultValue: T,
    readTypes: readonly ValueType[]
  ): ResolutionDetails<T> {
    const result = toResolutionDetails(details, defaultValue);
    if (result.errorCode === ErrorCode.TYPE_MISMATCH) {
      const valueType = this.declaredValueType(flagKey);
      if (valueType !== undefined && readTypes.includes(valueType)) {
        result.errorCode = ErrorCode.PARSE_ERROR;
      }
    }
    return result;
  }

  private declaredValueType(flagKey: string): ValueType | undefined {
    try {
      return this.client.rawConfig(flagKey)?.valueType;
    } catch {
      return undefined; // not initialized: keep the native error code
    }
  }

  /**
   * Escape hatch: access the underlying @quonfig/node client for native-only features
   * (shouldLog, keys, rawConfig, etc.)
   */
  getClient(): Quonfig {
    return this.client;
  }
}

// The declared valueTypes each OpenFeature read accepts; these mirror sdk-node's
// own check of the requested type against a config's valueType.
const BOOL_TYPES: readonly ValueType[] = ["bool"];
const STRING_TYPES: readonly ValueType[] = ["string", "log_level"];
const NUMBER_TYPES: readonly ValueType[] = ["int", "double"];
const OBJECT_TYPES: readonly ValueType[] = ["string_list", "json"];

/**
 * Translate a Quonfig EvaluationDetails<T> into an OpenFeature ResolutionDetails<T>.
 *
 * Reason mapping (from the brief):
 *   STATIC           → StandardResolutionReasons.STATIC
 *   TARGETING_MATCH  → StandardResolutionReasons.TARGETING_MATCH
 *   SPLIT            → StandardResolutionReasons.SPLIT
 *   DEFAULT          → defaultValue + StandardResolutionReasons.DEFAULT
 *   ERROR            → defaultValue + ERROR + errorCode (FLAG_NOT_FOUND / TYPE_MISMATCH /
 *                      PROVIDER_NOT_READY / GENERAL; QuonfigProvider.resolve refines a
 *                      malformed value's TYPE_MISMATCH to PARSE_ERROR)
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
