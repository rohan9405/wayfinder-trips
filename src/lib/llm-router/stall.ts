/**
 * Abort controller that also fires when a model sends nothing for `timeoutMs` (models under
 * load sometimes accept a request and then stall). Call `gotData()` on the first chunk and
 * check `stalled` when handling the abort.
 */
export function stallGuard(signal: AbortSignal, timeoutMs = 15_000) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort);
  const guard = {
    signal: controller.signal,
    stalled: false,
    gotData: () => clearTimeout(timer),
    dispose: () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
  };
  const timer = setTimeout(() => {
    guard.stalled = true;
    controller.abort();
  }, timeoutMs);
  return guard;
}
