/**
 * Minimal polyfills for test environment.
 * Runs before every test suite via jest.config `setupFiles`.
 */

import { TextEncoder, TextDecoder } from 'util';

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}
