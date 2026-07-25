export const CSRF_COOKIE_NAME = "pglms_csrf";
export const CSRF_HEADER_NAME = "x-pglms-csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChangingMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}
