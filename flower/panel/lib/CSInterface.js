/*
 * Minimal development stub for editor/browser tests.
 * In CEP, Adobe's CSInterface.js should shadow or replace this file.
 */
(function () {
  if (window.CSInterface) return;
  window.CSInterface = function CSInterface() {};
  window.CSInterface.prototype.evalScript = function evalScript(_script, callback) {
    callback(JSON.stringify({
      ok: false,
      error: {
        code: "FLOWER_CEP_STUB",
        message: "CSInterface stub is loaded. Open this panel inside After Effects CEP."
      }
    }));
  };
})();
