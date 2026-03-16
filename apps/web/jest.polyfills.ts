/**
 * Minimal polyfills for test environment.
 * Runs before every test suite via jest.config `setupFiles`.
 */

import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

if (typeof globalThis.crypto === 'undefined') {
  Object.assign(globalThis, { crypto: webcrypto });
}
