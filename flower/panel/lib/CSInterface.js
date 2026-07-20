/*
 * Minimal CSInterface shim for the flower development CEP panel.
 * In After Effects CEP, Adobe exposes window.__adobe_cep__; in a normal
 * browser this file returns a clear stub error for bridge calls.
 */
(function () {
  if (window.CSInterface) return;

  window.CSInterface = function CSInterface() {};

  window.CSInterface.prototype.evalScript = function evalScript(script, callback) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function") {
      window.__adobe_cep__.evalScript(script, callback);
      return;
    }

    callback(JSON.stringify({
      ok: false,
      error: {
        code: "FLOWER_CEP_STUB",
        message: "CSInterface bridge is unavailable. Open this panel inside After Effects CEP with Adobe CEP runtime enabled."
      }
    }));
  };
})();
