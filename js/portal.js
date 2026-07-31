/* ============================================================
   Tracercoin (TFX) — miner portal client
   Vanilla JS, no dependencies. Talks to the portal API the
   backend exposes at /api/portal/*.
   ============================================================ */
var API = "/api/portal";
var TOKEN_KEY = "tfx_portal_token";

(function () {
  "use strict";

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    // Re-apply the shared header state (data-tfx-auth/reg) so the nav flips
    // between guest and signed-in immediately — no page reload needed.
    if (window.TFXAuth && window.TFXAuth.refresh) window.TFXAuth.refresh();
  }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function status(el, msg, type) {
    el.textContent = msg || "";
    el.className = "form-status" + (type ? " is-" + type : "");
    if (el.style) el.style.textAlign = el.id === "worker-status" || el.id === "twofa-status" ? "left" : el.style.textAlign;
  }

  // Core fetch wrapper. Adds bearer auth + parses JSON + surfaces {detail}.
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Accept": "application/json" };
    if (opts.body) headers["Content-Type"] = "application/json";
    var tok = opts.token !== undefined ? opts.token : getToken();
    if (tok) headers["Authorization"] = "Bearer " + tok;
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.detail || ("Request failed (" + res.status + ")"));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function fmtHash(hps) {
    hps = Number(hps) || 0;
    var u = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s"], i = 0;
    while (hps >= 1000 && i < u.length - 1) { hps /= 1000; i++; }
    return (i === 0 ? hps.toFixed(0) : hps.toFixed(2)) + " " + u[i];
  }
  function fmtTfx(n) { return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 8 }) + " TFX"; }
  function fmtTime(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch (e) { return iso; } }
  function shortHash(h) { return h ? (String(h).slice(0, 10) + "…") : "—"; }

  /* ============================================================
     AUTH VIEW
     ============================================================ */
  var authView = $("auth-view");
  var dashView = $("dash-view");
  var tabLogin = $("tab-login"), tabRegister = $("tab-register");
  var loginForm = $("login-form"), registerForm = $("register-form"), otpForm = $("otp-form");

  function selectTab(which) {
    var login = which === "login";
    tabLogin.setAttribute("aria-selected", String(login));
    tabRegister.setAttribute("aria-selected", String(!login));
    login ? show(loginForm) : hide(loginForm);
    login ? hide(registerForm) : show(registerForm);
    hide(otpForm);
  }
  tabLogin.addEventListener("click", function () { selectTab("login"); });
  tabRegister.addEventListener("click", function () { selectTab("register"); });

  // ---- Register ----
  registerForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("reg-status");
    var username = $("reg-username").value.trim().toLowerCase();
    var password = $("reg-password").value;
    var address = $("reg-address").value.trim();
    var agreed = $("reg-terms").checked;
    if (username.length < 3) { status(st, "Choose a username of at least 3 characters.", "error"); return; }
    if (password.length < 8) { status(st, "Password must be at least 8 characters.", "error"); return; }
    if (!agreed) { status(st, "Please accept the Terms of Service & Usage Agreement to continue.", "error"); return; }

    var btn = $("reg-submit"); btn.disabled = true; status(st, "Creating your account…");
    api("/register", { method: "POST", body: { username: username, password: password, payout_address: address || null, accepted_terms: true } })
      .then(function (data) { setToken(data.token); enterDashboard(); })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  // ---- Login (may branch into 2FA) ----
  var pendingToken = "";   // short-lived token while a 2FA code is outstanding
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("login-status");
    var username = $("login-username").value.trim().toLowerCase();
    var password = $("login-password").value;
    if (!username || !password) { status(st, "Enter your username and password.", "error"); return; }

    var btn = $("login-submit"); btn.disabled = true; status(st, "Signing in…");
    api("/login", { method: "POST", body: { username: username, password: password } })
      .then(function (data) {
        if (data.twofa_required) {
          pendingToken = data.pending_token;
          $("otp-target").textContent = data.phone_masked || "your phone";
          hide(loginForm); hide(registerForm); show(otpForm);
          $("otp-code").focus();
          status(st, "");
        } else {
          setToken(data.token); enterDashboard();
        }
      })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  // ---- 2FA code at login ----
  otpForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("otp-status");
    var code = ($("otp-code").value || "").replace(/\D/g, "");
    if (code.length < 4) { status(st, "Enter the code we texted you.", "error"); return; }
    var btn = $("otp-submit"); btn.disabled = true; status(st, "Verifying…");
    api("/login/2fa", { method: "POST", token: pendingToken, body: { code: code } })
      .then(function (data) { setToken(data.token); pendingToken = ""; enterDashboard(); })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function enterDashboard() {
    hide(authView); show(dashView);
    refreshAll();
  }
  function leaveDashboard() {
    hide(dashView); show(authView);
    selectTab("login");
  }

  $("logout-btn").addEventListener("click", function () {
    api("/logout", { method: "POST" }).catch(function () {}).finally(function () {
      setToken(""); leaveDashboard();
    });
  });
  $("refresh-btn").addEventListener("click", refreshAll);

  function refreshAll() {
    var ds = $("dash-status"); status(ds, "");
    Promise.all([loadMe(), loadActivity(), loadWorkers(), loadPayouts(), loadBlocks()])
      .catch(function (err) {
        if (err && err.status === 401) { setToken(""); leaveDashboard(); }
        else status(ds, (err && err.message) || "Couldn't load your dashboard.", "error");
      });
  }

  function loadMe() {
    return api("/me").then(function (me) {
      $("dash-username").textContent = me.username;
      var toggle = $("twofa-toggle");
      toggle.checked = !!me.twofa_enabled;
      $("twofa-state").textContent = me.twofa_enabled
        ? "Currently on." + (me.phone_masked ? " Codes go to " + me.phone_masked + "." : "")
        : "Currently off.";
      window.__me = me;
      renderPayout(me);
      return me;
    });
  }

  /* ---------- Payout address ---------- */
  // A mainnet TFX address is bech32 with the `tfx` prefix. The server does the
  // authoritative checksum check; this is just a friendly client-side format hint.
  var PAYOUT_RE = /^tfx1[02-9ac-hj-np-z]{6,87}$/i;

  function renderPayout(me) {
    var cur = $("payout-current"), input = $("payout-address");
    if (!cur || !input) return;
    var addr = me && me.payout_address;
    if (addr) {
      cur.className = "muted";
      cur.innerHTML = "Current: <span class='inline-code'>" + esc(addr) + "</span>";
      if (document.activeElement !== input) input.value = addr;
    } else {
      cur.className = "form-status is-error";
      cur.textContent = "Not set — add an address below so the pool can pay you.";
      if (document.activeElement !== input) input.value = "";
    }
  }

  var payoutForm = $("payout-form");
  if (payoutForm) {
    payoutForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var st = $("payout-status");
      var addr = ($("payout-address").value || "").trim();
      if (!addr) { status(st, "Enter your tfx1… payout address.", "error"); return; }
      if (!PAYOUT_RE.test(addr)) {
        status(st, "That doesn't look like a tfx1… address — double-check and try again.", "error");
        return;
      }
      var btn = $("payout-save"); btn.disabled = true; status(st, "Saving…");
      api("/account", { method: "PATCH", body: { payout_address: addr } })
        .then(function (me) {
          window.__me = me;
          renderPayout(me);
          status(st, "Payout address saved.", "success");
        })
        .catch(function (err) { status(st, err.message, "error"); })
        .finally(function () { btn.disabled = false; });
    });
  }

  function loadActivity() {
    return api("/activity").then(function (a) {
      $("s-workers").textContent = a.summary.workers;
      $("s-online").textContent = a.summary.online;
      $("s-hashrate").textContent = fmtHash(a.summary.hashrate);

      var bar = $("round-bar"), wrap = $("round-bar-wrap"), txt = $("round-text");
      if (a.round && a.round.progress != null) {
        var pct = Math.round(a.round.progress * 100);
        bar.style.width = pct + "%"; wrap.setAttribute("aria-valuenow", String(pct));
        txt.textContent = pct + "% of an estimated round complete.";
      } else {
        bar.style.width = "0%"; wrap.setAttribute("aria-valuenow", "0");
        txt.textContent = a.note || "Waiting for the pool to come online.";
      }

      // Worker activity table (merged into the workers panel render below via cache)
      window.__activity = a;
      renderWorkersTable();
    });
  }

  function loadPayouts() {
    return api("/payouts").then(function (p) {
      $("s-pending").textContent = fmtTfx(p.totals.pending_tfx);
      $("p-paid").textContent = fmtTfx(p.totals.paid_tfx);
      $("p-pending").textContent = fmtTfx(p.totals.pending_tfx);
      $("p-lifetime").textContent = fmtTfx(p.totals.lifetime_tfx);

      var host = $("payouts-table");
      if (!p.history.length) { host.innerHTML = '<p class="empty">No rewards yet. Once your workers find shares in a completed block, payouts appear here.</p>'; return; }
      var rows = p.history.map(function (r) {
        return "<tr>" +
          "<td class='mono'>" + esc(r.worker_name || "—") + "</td>" +
          "<td class='mono'>" + fmtTfx(r.amount_tfx) + "</td>" +
          "<td>" + (r.block_height != null ? "#" + esc(r.block_height) : "—") + "</td>" +
          "<td><span class='pill " + esc(r.status) + "'>" + esc(r.status) + "</span></td>" +
          "<td>" + fmtTime(r.created_at) + "</td>" +
          "<td class='mono'>" + (r.txid ? shortHash(r.txid) : "—") + "</td>" +
          "</tr>";
      }).join("");
      host.innerHTML = "<table class='grid'><thead><tr><th>Worker</th><th>Amount</th><th>Block</th><th>Status</th><th>Credited</th><th>Tx</th></tr></thead><tbody>" + rows + "</tbody></table>";
    });
  }

  function loadBlocks() {
    return api("/blocks?limit=15").then(function (b) {
      var host = $("blocks-table");
      if (!b.blocks.length) { host.innerHTML = '<p class="empty">No blocks yet — the pool hasn\'t completed a block. This fills in as mining begins.</p>'; return; }
      var rows = b.blocks.map(function (r) {
        return "<tr>" +
          "<td class='mono'>#" + esc(r.height) + "</td>" +
          "<td class='mono'>" + shortHash(r.hash) + "</td>" +
          "<td class='mono'>" + fmtTfx(r.reward_tfx) + "</td>" +
          "<td><span class='pill " + esc(r.status) + "'>" + esc(r.status) + "</span></td>" +
          "<td>" + fmtTime(r.found_at) + "</td>" +
          "</tr>";
      }).join("");
      host.innerHTML = "<table class='grid'><thead><tr><th>Height</th><th>Hash</th><th>Reward</th><th>Status</th><th>Found</th></tr></thead><tbody>" + rows + "</tbody></table>";
    });
  }

  /* ---------- Workers ---------- */
  var workersCache = [];
  function loadWorkers() {
    return api("/workers").then(function (w) {
      workersCache = w.workers || [];
      window.__stratumFmt = w.stratum_login_format;
      renderWorkersTable();
    });
  }

  function renderWorkersTable() {
    var host = $("workers-table");
    if (!workersCache.length) {
      host.innerHTML = '<p class="empty">No workers yet. Add one to get a login for your mining rig.</p>';
      return;
    }
    var stats = (window.__activity && window.__activity.workers) || [];
    var byLogin = {};
    stats.forEach(function (s) { byLogin[s.login] = s; });

    var rows = workersCache.map(function (wkr) {
      var s = byLogin[wkr.login] || {};
      var online = s.online ? "<span class='pill on'>online</span>" : "<span class='pill off'>offline</span>";
      return "<tr>" +
        "<td><button class='linklike mono' data-edit='" + esc(wkr.worker) + "'>" + esc(wkr.login) + "</button></td>" +
        "<td>" + esc(wkr.label || "—") + "</td>" +
        "<td class='mono'>" + fmtHash(s.hashrate || 0) + "</td>" +
        "<td class='mono'>" + (s.shares_valid || 0) + "</td>" +
        "<td>" + online + "</td>" +
        "<td class='row-actions'>" +
          "<button class='btn btn-ghost btn-sm' data-edit='" + esc(wkr.worker) + "'>Manage</button>" +
          "<button class='btn btn-danger btn-sm' data-del='" + esc(wkr.worker) + "'>Remove</button>" +
        "</td>" +
        "</tr>";
    }).join("");
    host.innerHTML = "<table class='grid'><thead><tr><th>Login</th><th>Label</th><th>Hash rate</th><th>Shares</th><th>Status</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";

    Array.prototype.forEach.call(host.querySelectorAll("[data-edit]"), function (btn) {
      btn.addEventListener("click", function () { openWorkerEdit(btn.getAttribute("data-edit")); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-del]"), function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-del");
        if (!window.confirm("Remove worker '" + name + "'? Its rig will stop being able to log in.")) return;
        btn.disabled = true;
        api("/workers/" + encodeURIComponent(name), { method: "DELETE" })
          .then(function () { if (selectedWorker === name) closeWorkerEdit(); return loadWorkers(); })
          .catch(function (err) { status($("dash-status"), err.message, "error"); btn.disabled = false; });
      });
    });
  }

  /* ---------- Manage a selected worker (label + password rotation) ---------- */
  var selectedWorker = null;   // short worker name
  var genRotate = false;       // "generate a random one" was clicked
  var editPanel = $("worker-edit");

  function openWorkerEdit(name) {
    var wkr = workersCache.filter(function (w) { return w.worker === name; })[0];
    if (!wkr) return;
    selectedWorker = name;
    genRotate = false;
    $("edit-login").textContent = wkr.login;
    $("edit-label").value = wkr.label || "";
    $("edit-password").value = "";
    hide($("edit-gen-note")); hide($("edit-reveal"));
    $("edit-pass-shown").textContent = "";
    status($("edit-status"), "");
    show(editPanel);
    editPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("edit-label").focus();
  }
  function closeWorkerEdit() { selectedWorker = null; genRotate = false; hide(editPanel); }

  $("edit-cancel").addEventListener("click", closeWorkerEdit);
  $("edit-generate").addEventListener("click", function () {
    genRotate = true;
    $("edit-password").value = "";
    show($("edit-gen-note"));
  });
  $("edit-password").addEventListener("input", function () {
    // Typing an explicit password overrides "generate a random one".
    if ($("edit-password").value) { genRotate = false; hide($("edit-gen-note")); }
  });

  $("worker-edit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!selectedWorker) return;
    var st = $("edit-status");
    var body = { label: $("edit-label").value.trim() };
    var typed = $("edit-password").value;
    if (typed) {
      if (typed.length < 6) { status(st, "Worker password must be at least 6 characters.", "error"); return; }
      body.password = typed;
    } else if (genRotate) {
      body.rotate_password = true;
    }
    var btn = $("edit-save"); btn.disabled = true; status(st, "Saving…");
    api("/workers/" + encodeURIComponent(selectedWorker), { method: "PATCH", body: body })
      .then(function (data) {
        if (data.password) {
          $("edit-pass-shown").textContent = data.password;
          show($("edit-reveal"));
          status(st, "Saved. Copy the new password into your rig.", "success");
        } else if (data.password_changed) {
          status(st, "Saved. Update your rig with the new password.", "success");
        } else {
          status(st, "Settings saved.", "success");
        }
        $("edit-password").value = ""; genRotate = false; hide($("edit-gen-note"));
        return loadWorkers();
      })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  // Add-worker form
  var addForm = $("add-worker-form");
  $("add-worker-btn").addEventListener("click", function () {
    addForm.classList.contains("hidden") ? (show(addForm), $("worker-name").focus()) : hide(addForm);
    resetWorkerForm();
  });
  $("worker-cancel").addEventListener("click", function () { hide(addForm); resetWorkerForm(); });
  $("worker-name").addEventListener("input", function () {
    var u = (window.__me && window.__me.username) || "username";
    $("worker-login-preview").textContent = u + "." + (($("worker-name").value.trim().toLowerCase()) || "rig01");
  });
  function resetWorkerForm() {
    $("worker-name").value = ""; $("worker-label").value = "";
    status($("worker-status"), ""); hide($("worker-reveal")); $("worker-pass").textContent = "";
  }
  addForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var st = $("worker-status");
    var name = $("worker-name").value.trim().toLowerCase();
    var label = $("worker-label").value.trim();
    if (!name) { status(st, "Give the worker a name.", "error"); return; }
    var btn = $("worker-create"); btn.disabled = true; status(st, "Creating worker…");
    api("/workers", { method: "POST", body: { worker_name: name, label: label || null } })
      .then(function (data) {
        status(st, "Worker created.", "success");
        if (data.password) {
          $("worker-pass").textContent = data.password;
          show($("worker-reveal"));
        }
        $("worker-name").value = ""; $("worker-label").value = "";
        return loadWorkers();
      })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  /* ---------- 2FA toggle ---------- */
  var twofaToggle = $("twofa-toggle");
  var enableForm = $("twofa-enable-form");
  twofaToggle.addEventListener("change", function () {
    if (twofaToggle.checked) {
      // Turning ON: reveal the phone + code flow. Keep it unchecked until confirmed.
      twofaToggle.checked = false;
      show(enableForm); $("twofa-phone").focus();
      hide($("twofa-code-field")); hide($("twofa-confirm-actions"));
      status($("twofa-status"), "");
    } else {
      // Turning OFF: confirm, then call disable.
      if (!window.confirm("Turn off two-factor? You'll sign in with just your username and password.")) {
        twofaToggle.checked = true; return;
      }
      api("/2fa/disable", { method: "POST" })
        .then(function () { return loadMe(); })
        .then(function () { status($("twofa-status"), "Two-factor turned off.", "success"); })
        .catch(function (err) { twofaToggle.checked = true; status($("twofa-status"), err.message, "error"); });
    }
  });

  $("twofa-enable-cancel").addEventListener("click", function () {
    hide(enableForm); status($("twofa-status"), "");
  });

  enableForm.addEventListener("submit", function (e) {
    e.preventDefault();  // "Send code"
    var st = $("twofa-status");
    var phone = $("twofa-phone").value.trim();
    if ((phone.match(/\d/g) || []).length < 10) { status(st, "Enter a valid cell phone number.", "error"); return; }
    var btn = $("twofa-send"); btn.disabled = true; status(st, "Texting a code…");
    api("/2fa/enable", { method: "POST", body: { phone: phone } })
      .then(function (data) {
        status(st, "Code sent to " + (data.phone_masked || "your phone") + ".", "success");
        show($("twofa-code-field")); show($("twofa-confirm-actions")); $("twofa-code").focus();
      })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  $("twofa-confirm").addEventListener("click", function () {
    var st = $("twofa-status");
    var code = ($("twofa-code").value || "").replace(/\D/g, "");
    if (code.length < 4) { status(st, "Enter the code we texted you.", "error"); return; }
    var btn = $("twofa-confirm"); btn.disabled = true; status(st, "Turning on two-factor…");
    api("/2fa/confirm", { method: "POST", body: { code: code } })
      .then(function () { return loadMe(); })
      .then(function () {
        status(st, "Two-factor is on. You'll need a texted code next time you sign in.", "success");
        hide(enableForm);
      })
      .catch(function (err) { status(st, err.message, "error"); })
      .finally(function () { btn.disabled = false; });
  });

  /* ============================================================
     BOOT: if we already hold a token, try the dashboard.
     ============================================================ */
  if (getToken()) {
    api("/me").then(function () { enterDashboard(); })
      .catch(function () { setToken(""); leaveDashboard(); });
  }
})();
