// Command palette (⌘K / Ctrl+K). Vanilla JS, no framework — keyboard handling
// is simpler and more reliable here than via signals. The destination list is
// rendered server-side as <a data-cmd> items inside #cmdk-list; this script
// only toggles the overlay, filters, and drives arrow/enter navigation.
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var overlay = document.getElementById("cmdk");
    if (!overlay) return;
    var input = document.getElementById("cmdk-input");
    var list = document.getElementById("cmdk-list");
    var items = Array.prototype.slice.call(list.querySelectorAll("[data-cmd]"));
    var active = -1;

    function visible() {
      return items.filter(function (el) {
        return !el.hasAttribute("hidden");
      });
    }

    function setActive(i) {
      var vis = visible();
      vis.forEach(function (el) {
        el.removeAttribute("data-active");
      });
      if (vis.length === 0) {
        active = -1;
        return;
      }
      active = (i + vis.length) % vis.length;
      var el = vis[active];
      el.setAttribute("data-active", "");
      el.scrollIntoView({ block: "nearest" });
    }

    function open() {
      overlay.removeAttribute("hidden");
      input.value = "";
      filter("");
      input.focus();
    }

    function close() {
      overlay.setAttribute("hidden", "");
    }

    function filter(q) {
      q = q.trim().toLowerCase();
      items.forEach(function (el) {
        var hay = (el.getAttribute("data-cmd") || "").toLowerCase();
        if (q === "" || hay.indexOf(q) !== -1) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      });
      setActive(0);
    }

    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (overlay.hasAttribute("hidden")) open();
        else close();
        return;
      }
      if (overlay.hasAttribute("hidden")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(active + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(active - 1);
      } else if (e.key === "Enter") {
        var vis = visible();
        if (active >= 0 && vis[active]) {
          e.preventDefault();
          window.location.href = vis[active].getAttribute("href");
        }
      }
    });

    input.addEventListener("input", function () {
      filter(input.value);
    });

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    // Expose openers for the topbar search button.
    var openers = document.querySelectorAll("[data-cmdk-open]");
    openers.forEach(function (btn) {
      btn.addEventListener("click", open);
    });
  });
})();
