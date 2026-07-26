/* ============================================================
   Tracercoin (TFX) — Status & release notes renderer
   ------------------------------------------------------------
   Renders the reports page from two static JSON files so the
   report is updated by editing JSON (+ scp), never HTML:

     /data/status.json         → project status + workstreams
     /data/release-notes.json  → changelog entries

   Content only renders for registered visitors; gating is done
   in CSS via [data-tfx="reg-only"] (see /js/auth-state.js).
   This script still fetches for everyone but the container is
   hidden for anonymous visitors, so no member-only detail is
   painted into a visible node.
   ============================================================ */
(function () {
  "use strict";

  var STATE_LABEL = {
    "shipped": "Shipped & operational",
    "in-progress": "In progress",
    "blocked": "Blocked / needs work"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtDate(iso) {
    // iso is "YYYY-MM-DD"; render as "Jul 26, 2026" without timezone drift
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return esc(iso);
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[parseInt(m[2], 10) - 1] + " " + parseInt(m[3], 10) + ", " + m[1];
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " → " + r.status);
      return r.json();
    });
  }

  function renderStatus(data) {
    var host = document.getElementById("status-body");
    if (!host) return;

    var asOf = document.getElementById("status-asof");
    if (asOf) asOf.textContent = "Updated " + fmtDate(data.as_of);

    var lead = document.getElementById("status-summary");
    if (lead && data.summary) lead.textContent = data.summary;

    var head = document.getElementById("status-headline");
    if (head && data.headline) head.textContent = data.headline;

    var rows = (data.workstreams || []).map(function (w) {
      var pct = Math.max(0, Math.min(100, Number(w.percent) || 0));
      var state = w.state || "in-progress";
      return '' +
        '<div class="ws-row">' +
          '<div class="ws-name">' + esc(w.name) +
            '<small>' + esc(w.detail || "") + '</small>' +
          '</div>' +
          '<div class="ws-track" role="img" aria-label="' + esc(w.name) + ': ' + pct + ' percent, ' + esc(STATE_LABEL[state] || state) + '">' +
            '<div class="ws-fill ws-' + esc(state) + '" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="ws-pct">' + pct + '%</div>' +
        '</div>';
    }).join("");

    var milestones = (data.next_milestones || []).map(function (m) {
      return '<li>' + esc(m) + '</li>';
    }).join("");

    host.innerHTML =
      '<div class="ws-rows">' + rows + '</div>' +
      '<div class="ws-legend">' +
        '<span><i class="sw sw-shipped"></i> Shipped &amp; operational</span>' +
        '<span><i class="sw sw-in-progress"></i> In progress</span>' +
        '<span><i class="sw sw-blocked"></i> Blocked / needs work</span>' +
      '</div>' +
      (milestones ? '<div class="next-block"><h3>What’s next</h3><ul class="next-list">' + milestones + '</ul></div>' : '');
  }

  function renderNotes(data) {
    var host = document.getElementById("notes-body");
    if (!host) return;

    var notes = data.notes || [];
    if (!notes.length) { host.innerHTML = '<p class="muted">No release notes yet.</p>'; return; }

    host.innerHTML = notes.map(function (n) {
      var tags = (n.tags || []).map(function (t) {
        return '<span class="rn-tag rn-' + esc(t) + '">' + esc(t) + '</span>';
      }).join("");
      var items = (n.items || []).map(function (it) {
        return '<li>' + esc(it) + '</li>';
      }).join("");
      return '' +
        '<article class="rn-entry">' +
          '<div class="rn-meta">' +
            '<time class="rn-date">' + fmtDate(n.date) + '</time>' +
            (n.version ? '<span class="rn-ver">' + esc(n.version) + '</span>' : '') +
          '</div>' +
          '<div class="rn-main">' +
            '<h3 class="rn-title">' + esc(n.title) + ' ' + tags + '</h3>' +
            '<ul class="rn-items">' + items + '</ul>' +
          '</div>' +
        '</article>';
    }).join("");
  }

  function fail(id, url) {
    var host = document.getElementById(id);
    if (host) host.innerHTML = '<p class="muted">Couldn’t load ' + esc(url) + ' right now. Please refresh.</p>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    getJSON("/data/status.json").then(renderStatus).catch(function () { fail("status-body", "/data/status.json"); });
    getJSON("/data/release-notes.json").then(renderNotes).catch(function () { fail("notes-body", "/data/release-notes.json"); });
  });
})();
