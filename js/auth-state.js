/* ============================================================
   Tracercoin (TFX) — shared account / waitlist state
   ------------------------------------------------------------
   Drives page visibility from two REAL, server-backed states:

     • "registered"  — the visitor has joined the waitlist
                       (POST /api/waitlist, number assigned by
                       the database) OR is signed into the miner
                       portal (POST /login, bearer token).
     • "on the list" — a waitlist number returned by the backend
                       is cached locally so it can be shown again.

   localStorage is only a CACHE of what the backend/DB returned —
   the source of truth is the route response. Keys:
     tfx_portal_token  → set by /js/portal.js after a real login
     tfx_waitlist      → {number, at} cached from /api/waitlist

   This file sets attributes on <html> synchronously (loaded in
   <head>, before first paint) so there is no flash of the
   "join" UI for someone who is already on the list:

     data-tfx-auth = in | out    (portal login present?)
     data-tfx-list = yes | no    (waitlist number cached?)
     data-tfx-reg  = yes | no    (either of the above — "registered")

   Matching visibility rules live in /css/styles.css:
     [data-tfx="reg-only"]   show only when registered
     [data-tfx="anon-only"]  show only when NOT registered
     [data-tfx="list-only"]  show only when a waitlist number exists
   ============================================================ */
(function () {
  "use strict";

  var LS_TOKEN = "tfx_portal_token";
  var LS_WAITLIST = "tfx_waitlist";
  var doc = document.documentElement;

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  function waitlistNumber() {
    var raw = read(LS_WAITLIST);
    if (!raw) return null;
    try { var o = JSON.parse(raw); return (o && o.number != null) ? o.number : null; }
    catch (e) { return raw; } // tolerate a bare stored value
  }

  function fillNumbers(num) {
    if (num == null) return;
    var els = document.querySelectorAll("[data-tfx-number]");
    for (var i = 0; i < els.length; i++) els[i].textContent = "#" + num;
  }

  function apply() {
    var loggedIn = !!read(LS_TOKEN);
    var num = waitlistNumber();
    var onList = num != null;
    doc.setAttribute("data-tfx-auth", loggedIn ? "in" : "out");
    doc.setAttribute("data-tfx-list", onList ? "yes" : "no");
    doc.setAttribute("data-tfx-reg", (loggedIn || onList) ? "yes" : "no");
    fillNumbers(num); // no-op if the DOM isn't parsed yet
  }

  // Set attributes immediately (pre-paint) to avoid a flash.
  apply();

  // Fill number nodes once the DOM exists.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { fillNumbers(waitlistNumber()); });
  } else {
    fillNumbers(waitlistNumber());
  }

  // ---- Global logout (header "Log out", shown on every page when signed in) ----
  // Clears the portal token, best-effort invalidates it server-side, then
  // reloads so the current page renders its signed-out view.
  function doLogout(ev) {
    if (ev) ev.preventDefault();
    var tok = read(LS_TOKEN);
    try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
    apply();
    var done = false;
    var go = function () { if (done) return; done = true; window.location.reload(); };
    if (tok) {
      setTimeout(go, 1500); // don't hang if the network is slow
      try {
        fetch("/api/portal/logout", { method: "POST", headers: { "Authorization": "Bearer " + tok } })
          .then(go, go);
      } catch (e) { go(); }
    } else {
      go();
    }
  }

  function wireLogout() {
    var btns = document.querySelectorAll("[data-tfx-logout]");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", doLogout);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLogout);
  } else {
    wireLogout();
  }

  // Public hook so the waitlist form can flip state live after a
  // successful POST /api/waitlist (number assigned by the DB).
  window.TFXAuth = {
    saveWaitlist: function (num) {
      try { localStorage.setItem(LS_WAITLIST, JSON.stringify({ number: num, at: Date.now() })); } catch (e) {}
      apply();
    },
    logout: doLogout,
    refresh: apply
  };
})();
