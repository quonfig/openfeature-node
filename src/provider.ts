import {
  EvaluationContext,
  JsonValue,
  Logger,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
} from "@openfeature/server-sdk";
import { Quonfig, QuonfigOptions } from "@quonfig/node";
import { mapContext } from "./context.js";
import { toErrorCode } from "./errors.js";

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
    // onConfigUpdate is not yet in the published @quonfig/node types; cast until sdk-node ships it
    this.client = new Quonfig({
      ...options,
      onConfigUpdate: () => {
        this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: [] });
      },
    } as ConstructorParameters<typeof Quonfig>[0]);
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
    try {
      const value = this.client.getBool(flagKey, mappedCtx);
      if (value === undefined) {
        return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
      }
      return { value, reason: StandardResolutionReasons.TARGETING_MATCH };
    } catch (err) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    try {
      const value = this.client.getString(flagKey, mappedCtx);
      if (value === undefined) {
        return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
      }
      return { value, reason: StandardResolutionReasons.TARGETING_MATCH };
    } catch (err) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    try {
      const value = this.client.getNumber(flagKey, mappedCtx);
      if (value === undefined) {
        return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
      }
      return { value, reason: StandardResolutionReasons.TARGETING_MATCH };
    } catch (err) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    const mappedCtx = mapContext(context, this.targetingKeyMapping);
    try {
      // Try string_list first (returns string[])
      const listVal = this.client.getStringList(flagKey, mappedCtx);
      if (listVal !== undefined) {
        return {
          value: listVal as unknown as T,
          reason: StandardResolutionReasons.TARGETING_MATCH,
        };
      }
      // Fall back to JSON
      const jsonVal = this.client.getJSON(flagKey, mappedCtx);
      if (jsonVal !== undefined) {
        return { value: jsonVal as T, reason: StandardResolutionReasons.TARGETING_MATCH };
      }
      return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT };
    } catch (err) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
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
