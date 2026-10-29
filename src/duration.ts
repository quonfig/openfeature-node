// The Quonfig ISO 8601 duration grammar (qfg-2agi.9). The one definition lives
// in integration-test-data tests/duration/grammar.yaml:
//
//   ^P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$
//
// plus: at least one component, no dangling T, a fraction only on S with at
// most 9 digits, total magnitude <= P36500D. ASCII digits only ([0-9], never
// \d) and anchored to the whole string. This mirrors sdk-node's own check,
// which @quonfig/node does not export (its `durationToMilliseconds` returns 0
// for a malformed value, so it cannot tell "PT0S" from "30s").
const PATTERN =
  /^P(?:([0-9]+)D)?(?:T(?=[0-9])(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\.([0-9]{1,9}))?S)?)?$/;

const MAX_SECONDS = 36_500n * 86_400n;

/** Whether `text` is a duration Quonfig accepts, per the shared grammar. */
export function isIsoDuration(text: string): boolean {
  const m = PATTERN.exec(text);
  if (m === null) return false;
  const [, days, hours, minutes, seconds, fraction] = m;
  if (days === undefined && hours === undefined && minutes === undefined && seconds === undefined) {
    return false;
  }
  const wholeSeconds =
    ((BigInt(days ?? "0") * 24n + BigInt(hours ?? "0")) * 60n + BigInt(minutes ?? "0")) * 60n +
    BigInt(seconds ?? "0");
  return (
    wholeSeconds < MAX_SECONDS || (wholeSeconds === MAX_SECONDS && !/[1-9]/.test(fraction ?? ""))
  );
}
