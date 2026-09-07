// Catch-all stand-in for a piece's third-party imports.
//
// Pieces import date libraries, crypto helpers, and vendor SDKs. Installing the
// whole Activepieces dependency tree to read an action's shape would be absurd,
// so anything that does not resolve becomes this permissive proxy: it can be
// called, constructed, awaited, and property-accessed without throwing. An
// action whose request genuinely depends on one of those libraries will produce
// no recorded request and be reported as needing a human.

function makeProxy(): any {
  const target: any = function () {
    return makeProxy();
  };
  return new Proxy(target, {
    get(_target, key) {
      if (key === "then") {
        // Never look thenable: an accidental await would hang or resolve to a proxy.
        return undefined;
      }
      if (key === Symbol.toPrimitive || key === "toString" || key === Symbol.toStringTag) {
        return () => "";
      }
      return makeProxy();
    },
    apply() {
      return makeProxy();
    },
    construct() {
      return makeProxy();
    },
  });
}

const stub = makeProxy();

export default stub;
export const __esModule = true;
