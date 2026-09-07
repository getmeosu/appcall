// Legacy callback asset: discard URL fragments without reading or submitting tokens.
(function () {
  "use strict";
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
})();
