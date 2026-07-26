/* ============================================================
   Tracercoin (TFX) — landing page behavior
   Vanilla JS, no dependencies.
   ============================================================ */

/* ============================================================
   >>> WAITLIST ENDPOINT CONFIGURATION — EDIT THIS ONE VALUE <<<
   ------------------------------------------------------------
   This is the ONLY thing you need to change to make the
   waitlist form live. See README.md for step-by-step setup.

   The form collects an EMAIL and/or a CELL PHONE NUMBER.
   Email = basic waitlist (launch updates). Cell phone =
   account for detailed product updates & release notes by
   SMS (via the Collect2Play Twilio account, server-side).

   Point this at the droplet backend that holds the Twilio
   credentials and sends the opt-in SMS, e.g. "/api/waitlist".
   The Auth Token must NEVER live in this file — the backend
   sends the SMS; the browser only POSTs the contact info.

   While this is left as the placeholder below, the form runs
   in DEMO MODE: it validates and shows the success state but
   does NOT send anything anywhere.
   ============================================================ */
var WAITLIST_ENDPOINT = "/api/waitlist";
var VERIFY_ENDPOINT = "/api/verify";
/* ============================================================ */

(function () {
  "use strict";

  /* ---------- current year in footer ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- mobile nav toggle ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var navLinks = document.getElementById("nav-links");
  if (toggle && navLinks) {
    toggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    // close the menu when a link is tapped
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        navLinks.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- waitlist form ---------- */
  var form = document.getElementById("waitlist-form");
  if (!form) return;

  var emailInput = document.getElementById("email");
  var emailError = document.getElementById("email-error");
  var phoneInput = document.getElementById("phone");
  var phoneError = document.getElementById("phone-error");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("waitlist-submit");
  var honeypot = form.querySelector('input[name="_gotcha"]');

  // Count digits only; accepts (), -, spaces, and a leading +.
  // 10 digits (US) up to 15 (E.164 max). Real validation is server-side.
  function digitCount(v) { return (v.match(/\d/g) || []).length; }
  // Loose email shape check; authoritative validation is server-side.
  function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function showFieldError(input, errEl, msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    input.setAttribute("aria-invalid", "true");
  }
  function clearFieldError(input, errEl) {
    errEl.textContent = "";
    errEl.hidden = true;
    input.removeAttribute("aria-invalid");
  }
  function clearAllErrors() {
    clearFieldError(emailInput, emailError);
    clearFieldError(phoneInput, phoneError);
  }
  function setStatus(msg, type) {
    statusEl.textContent = msg || "";
    statusEl.className = "form-status" + (type ? " is-" + type : "");
  }

  emailInput.addEventListener("input", function () {
    if (emailInput.getAttribute("aria-invalid") === "true") clearFieldError(emailInput, emailError);
  });
  phoneInput.addEventListener("input", function () {
    if (phoneInput.getAttribute("aria-invalid") === "true") clearFieldError(phoneInput, phoneError);
  });

  // Pull the waitlist number the backend assigned from the /api/waitlist
  // (or /api/verify) response. The DB is the source of truth; if the route
  // didn't return one yet, fall back to a local placeholder so the on-list
  // UI is still reviewable.
  function numberFrom(data) {
    if (data && data.number != null) return data.number;
    if (data && data.position != null) return data.position;
    if (data && data.id != null) return data.id;
    return null;
  }
  function localPlaceholderNumber() {
    return Math.floor(Math.random() * 9000) + 1000;
  }

  function renderSuccess(email, phone, data) {
    form.classList.add("is-done");
    setStatus("", null);

    // Cache the waitlist number + membership so the section shows the number
    // (instead of the join form) now and on return visits.
    var number = numberFrom(data);
    if (number == null) number = localPlaceholderNumber();
    if (window.TFXAuth) window.TFXAuth.saveWaitlist(number);

    // Tailor the confirmation to which channel(s) they gave us.
    var msg;
    if (phone && email) {
      msg = "Your account is set. We'll text detailed product updates and release notes, and email you launch news too.";
    } else if (phone) {
      msg = "Your account is set. We'll text detailed product updates and release notes, plus a heads-up at launch.";
    } else {
      msg = "You're on the list. We'll email you development updates and a heads-up at launch.";
    }
    var panel = document.createElement("div");
    panel.className = "success-panel";
    panel.setAttribute("role", "status");
    panel.innerHTML =
      '<div class="check" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</div>" +
      "<h3>" + (phone ? "You're all set." : "You're on the list.") + "</h3>" +
      "<p></p>";
    // set message via textContent to avoid any HTML injection
    panel.querySelector("p").textContent = msg;
    form.appendChild(panel);
    panel.focus && panel.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAllErrors();
    setStatus("", null);

    var email = emailInput.value.trim();
    var phone = phoneInput.value.trim();

    // honeypot: if filled, silently succeed (bot) without sending
    if (honeypot && honeypot.value.trim() !== "") {
      renderSuccess(email, phone);
      return;
    }

    // Require at least one contact method.
    if (!email && !phone) {
      showFieldError(emailInput, emailError, "Enter an email or a cell phone number.");
      emailInput.focus();
      return;
    }
    // Validate whichever field(s) were provided.
    if (email && !looksLikeEmail(email)) {
      showFieldError(emailInput, emailError, "Please enter a valid email address.");
      emailInput.focus();
      return;
    }
    if (phone) {
      var digits = digitCount(phone);
      if (digits < 10 || digits > 15) {
        showFieldError(phoneInput, phoneError, "Please enter a valid cell phone number.");
        phoneInput.focus();
        return;
      }
    }

    var endpointConfigured =
      WAITLIST_ENDPOINT &&
      WAITLIST_ENDPOINT.indexOf("REPLACE_WITH_YOUR_FORM_ENDPOINT_URL") === -1;

    // ----- DEMO MODE: no endpoint configured yet -----
    if (!endpointConfigured) {
      setStatus("Demo mode — no endpoint configured yet. See README.md.", null);
      // still show the success UX so the flow can be reviewed locally
      setTimeout(function () { renderSuccess(email, phone); }, 350);
      return;
    }

    // ----- LIVE MODE: POST to the configured endpoint -----
    submitBtn.disabled = true;
    var original = submitBtn.textContent;
    submitBtn.textContent = "Sending…";
    setStatus("Adding you to the waitlist…", null);

    fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email || null,
        phone: phone || null,
        // a cell number opts into the detailed-updates account tier
        account: phone ? true : false,
        source: "tracercoin.org",
        _gotcha: ""
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.detail || ("Request failed (" + res.status + ")"));
          return data;
        });
      })
      .then(function (data) {
        // Phone signups need an SMS code before the account is created.
        if (data && data.verification === "pending") {
          renderVerifyStep(email, phone, data.phone_masked || "");
        } else {
          renderSuccess(email, phone, data);
        }
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
        setStatus((err && err.message) || "Something went wrong. Please try again in a moment.", "error");
      });
  });

  /* ---------- SMS verification step (phone / account tier) ---------- */
  function renderVerifyStep(email, phone, phoneMasked) {
    form.classList.add("is-done"); // hides the original fields via existing CSS
    setStatus("", null);

    var panel = document.createElement("div");
    panel.className = "verify-panel";
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Enter your verification code");
    panel.innerHTML =
      "<h3>Check your phone</h3>" +
      "<p>We texted a verification code to <strong></strong>. Enter it to finish creating your account.</p>" +
      '<div class="field">' +
      '  <label for="otp-code">Verification code</label>' +
      '  <input type="text" id="otp-code" inputmode="numeric" autocomplete="one-time-code" ' +
      '     maxlength="10" placeholder="123456" aria-describedby="otp-error" />' +
      '  <p class="field-error" id="otp-error" role="alert" hidden></p>' +
      "</div>" +
      '<button type="button" class="btn btn-primary btn-block" id="otp-submit">Verify &amp; create account</button>' +
      '<p class="form-status" id="otp-status" role="status" aria-live="polite"></p>' +
      '<button type="button" class="linklike" id="otp-resend">Didn\'t get it? Resend code</button>';
    panel.querySelector("strong").textContent = phoneMasked || phone;
    form.appendChild(panel);

    var codeInput = panel.querySelector("#otp-code");
    var codeError = panel.querySelector("#otp-error");
    var otpBtn = panel.querySelector("#otp-submit");
    var otpStatus = panel.querySelector("#otp-status");
    var resendBtn = panel.querySelector("#otp-resend");
    codeInput.focus();

    codeInput.addEventListener("input", function () {
      if (codeInput.getAttribute("aria-invalid") === "true") {
        codeError.hidden = true; codeInput.removeAttribute("aria-invalid");
      }
    });

    otpBtn.addEventListener("click", function () {
      var code = (codeInput.value || "").replace(/\D/g, "");
      if (code.length < 4) {
        codeError.textContent = "Enter the code we texted you.";
        codeError.hidden = false;
        codeInput.setAttribute("aria-invalid", "true");
        codeInput.focus();
        return;
      }
      otpBtn.disabled = true;
      var label = otpBtn.textContent;
      otpBtn.textContent = "Verifying…";
      otpStatus.textContent = "";

      fetch(VERIFY_ENDPOINT, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone, code: code })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) throw new Error(data.detail || "That code didn't match.");
            return data;
          });
        })
        .then(function (vdata) {
          form.removeChild(panel);
          renderSuccess(email, phone, vdata);
        })
        .catch(function (err) {
          otpBtn.disabled = false;
          otpBtn.textContent = label;
          otpStatus.textContent = (err && err.message) || "That code didn't match. Please try again.";
          otpStatus.className = "form-status is-error";
        });
    });

    resendBtn.addEventListener("click", function () {
      resendBtn.disabled = true;
      otpStatus.textContent = "Sending a new code…";
      otpStatus.className = "form-status";
      fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email: null, phone: phone, account: true, source: "tracercoin.org", _gotcha: "" })
      })
        .then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function () { otpStatus.textContent = "A new code is on its way."; setTimeout(function () { resendBtn.disabled = false; }, 8000); })
        .catch(function () { otpStatus.textContent = "Couldn't resend just now — try again in a moment."; resendBtn.disabled = false; });
    });
  }
})();
