/* auth-fetch.js
   Anexa o token do usuário logado em toda chamada para /api/*
   e volta para o login se o servidor responder 401 (sessão inválida).
   Inclua com <script src="auth-fetch.js"></script> no <head> das páginas internas. */
(function () {
  var originalFetch = window.fetch;

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var ehApi = url.indexOf("/api/") === 0 || url.indexOf(location.origin + "/api/") === 0;

    if (ehApi) {
      try {
        var u = JSON.parse(localStorage.getItem("usuario") || "null");
        if (u && u.token) {
          init = init || {};
          var base = init.headers || (typeof input !== "string" && input.headers) || {};
          var h = new Headers(base);
          h.set("Authorization", "Bearer " + u.token);
          init.headers = h;
        }
      } catch (e) {}
    }

    return originalFetch.call(this, input, init).then(function (res) {
      if (ehApi && res.status === 401 && url.indexOf("/api/login") === -1) {
        localStorage.removeItem("usuario");
        (window.top || window).location.href = "login.html";
      }
      return res;
    });
  };
})();
