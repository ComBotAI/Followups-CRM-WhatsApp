/**
 * Polyfills the CPaaS SDK needs on React Native. Import this module first,
 * before anything that touches `@ab-ecosystem/cpaas`.
 *
 * - `URL` / `URLSearchParams`: Hermes ships a partial `URL`; the SDK builds every
 *   request with `new URL(...)` and `searchParams.set`, so the full polyfill is required.
 * - `AbortSignal.timeout`: the SDK passes `AbortSignal.timeout(ms)` as the fetch
 *   signal. Hermes has `AbortController` but not the static `timeout` helper.
 * - `crypto.getRandomValues`: the SDK draws ids from it (campaigns, uploads).
 *   Hermes has no Web Crypto; expo-crypto fills it from the OS's secure source.
 */
import { getRandomValues } from 'expo-crypto';
import 'react-native-url-polyfill/auto';

type CryptoLike = { getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T };
const g = globalThis as { crypto?: CryptoLike };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = g.crypto ?? {};
  g.crypto.getRandomValues = getRandomValues as CryptoLike['getRandomValues'];
}

type AbortSignalWithTimeout = typeof AbortSignal & {
  timeout?: (ms: number) => AbortSignal;
};

const signalCtor = AbortSignal as AbortSignalWithTimeout;
if (typeof signalCtor.timeout !== 'function') {
  signalCtor.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error(`Request timed out after ${ms}ms`)), ms);
    return controller.signal;
  };
}
