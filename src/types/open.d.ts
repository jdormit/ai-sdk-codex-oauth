/**
 * Type declaration for the optional 'open' package.
 * This is a soft dependency — imported dynamically with a try/catch fallback.
 */
declare module "open" {
  function open(target: string, options?: Record<string, unknown>): Promise<void>;
  export default open;
}
