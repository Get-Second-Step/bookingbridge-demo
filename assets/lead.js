/* BookingBridge lead page — quiet reveals, nav border, form.
   Rule carried from v1: content must NEVER depend on
   IntersectionObserver to become visible.
*/
(function () {
  "use strict";

  /* ---------- nav border on scroll ---------- */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    nav.classList.toggle("scrolled", window.scrollY > 10);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- quiet reveals with hard fallback ---------- */
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var els = document.querySelectorAll(".rv");

  var showAll = function () {
    els.forEach(function (el) { el.classList.add("in"); });
  };

  if (reduced || !("IntersectionObserver" in window)) {
    showAll();
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -4% 0px" }
    );
    els.forEach(function (el) { io.observe(el); });

    /* reveal what is already on screen immediately, and everything by 2.5s */
    var vh = window.innerHeight || document.documentElement.clientHeight;
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top < vh * 0.94) el.classList.add("in");
    });
    setTimeout(showAll, 2500);
  }

  /* ---------- request form ----------
     Not wired to a backend yet. Submissions are held in localStorage
     under `bb_leak_requests` so nothing typed is lost; swap deliver()
     for a real endpoint (POST /api/leads on the BookingBridge API,
     or Formspree/Tally) before launch.
  */
  var form = document.getElementById("leadForm");
  if (!form) return;

  var validate = function () {
    var ok = true;
    form.querySelectorAll(".rf-field").forEach(function (f) { f.classList.remove("invalid"); });

    var email = form.querySelector("#f-email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      email.closest(".rf-field").classList.add("invalid");
      ok = false;
    }
    var site = form.querySelector("#f-site");
    if (site.value.trim().length < 4 || site.value.indexOf(".") === -1) {
      site.closest(".rf-field").classList.add("invalid");
      ok = false;
    }
    return ok;
  };

  var deliver = function (payload) {
    try {
      var box = JSON.parse(localStorage.getItem("bb_leak_requests") || "[]");
      box.push(payload);
      localStorage.setItem("bb_leak_requests", JSON.stringify(box));
    } catch (e) { /* storage unavailable; nothing else to do client-side */ }
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;

    deliver({
      name: form.querySelector("#f-name").value.trim(),
      email: form.querySelector("#f-email").value.trim(),
      website: form.querySelector("#f-site").value.trim(),
      spend: form.querySelector("#f-spend").value,
      at: new Date().toISOString()
    });

    form.querySelector(".rf-done").hidden = false;
  });
})();
