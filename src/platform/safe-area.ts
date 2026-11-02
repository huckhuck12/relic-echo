import { platform } from './runtime.js';
export type { Insets as SafeArea } from './runtime.js';
export function readSafeArea() { return platform().safeArea(); }
