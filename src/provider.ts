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

  async initialize(_context?: EvaluationContext): Promise<void> {
    await this.client.init();
  }

  async shutdown(): Promise<void> {
    this.client.close();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getBoolDetails(flagKey, mappedCtx);
    return toResolutionDetails(details, defaultValue);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getStringDetails(flagKey, mappedCtx);
    return toResolutionDetails(details, defaultValue);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    const details = this.client.getNumberDetails(flagKey, mappedCtx);
    return toResolutionDetails(details, defaultValue);
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger,
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
        defaultValue,
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
 *   ERROR            → defaultValue + ERROR + errorCode (FLAG_NOT_FOUND / TYPE_MISMATCH / GENERAL)
 */
function toResolutionDetails<T>(
  details: EvaluationDetails<T>,
  defaultValue: T,
): ResolutionDetails<T> {
  switch (details.reason) {
    case "STATIC":
      return { value: details.value as T, reason: StandardResolutionReasons.STATIC };
    case "TARGETING_MATCH":
      return {
        value: details.value as T,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };
    case "SPLIT":
      return { value: details.value as T, reason: StandardResolutionReasons.SPLIT };
    case "DEFAULT":
      return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
    case "ERROR":
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toOFErrorCode(details.errorCode),
      };
  }
}

function toOFErrorCode(code: EvaluationDetails<unknown>["errorCode"]): ErrorCode {
  switch (code) {
    case "FLAG_NOT_FOUND":
      return ErrorCode.FLAG_NOT_FOUND;
    case "TYPE_MISMATCH":
      return ErrorCode.TYPE_MISMATCH;
    case "GENERAL":
    default:
      return ErrorCode.GENERAL;
  }
}
