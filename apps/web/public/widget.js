/**
 * sesh embeddable booking widget.
 *
 * Customers drop one line into their own site:
 *
 *   <sesh-booking slug="acme"></sesh-booking>
 *   <script src="https://app.sesh.example/widget.js" async></script>
 *
 * This script registers a <sesh-booking> custom element that mounts an iframe
 * of the public booking page (/book/:slug). The sesh origin is derived from
 * this script's own URL, so no configuration is required on the host page.
 *
 * Attributes:
 *   slug    (required) tenant slug, e.g. "acme"
 *   height  (optional) initial iframe height in px before the page reports its
 *           real height; defaults to 720
 *
 * The iframe auto-resizes to its content height via postMessage, so the embed
 * grows and shrinks with the booking flow and never shows an inner scrollbar.
 */
(function () {
  "use strict";

  var TAG = "sesh-booking";
  var RESIZE_TYPE = "sesh:resize";

  // Resolve the sesh origin from this script's own src so the embed is config-free.
  var SESH_ORIGIN = (function (script) {
    try {
      return new URL(script.src).origin;
    } catch (_) {
      return window.location.origin;
    }
  })(document.currentScript);

  function bookingUrl(slug) {
    return SESH_ORIGIN + "/book/" + encodeURIComponent(slug) + "?embed=1";
  }

  if (!window.customElements || customElements.get(TAG)) {
    return; // unsupported, or this script ran twice.
  }

  customElements.define(
    TAG,
    class SeshBooking extends HTMLElement {
      connectedCallback() {
        var slug = this.getAttribute("slug");
        var root = this.attachShadow({ mode: "open" });

        if (!slug) {
          root.innerHTML =
            '<p style="font:14px system-ui,sans-serif;color:#b91c1c">' +
            "&lt;sesh-booking&gt; is missing a required \"slug\" attribute." +
            "</p>";
          return;
        }

        var iframe = document.createElement("iframe");
        iframe.src = bookingUrl(slug);
        iframe.title = "Book a sesh";
        iframe.loading = "lazy";
        iframe.style.cssText =
          "width:100%;border:0;display:block;color-scheme:normal;height:" +
          (parseInt(this.getAttribute("height"), 10) || 720) +
          "px";
        this._iframe = iframe;
        root.appendChild(iframe);

        // Grow/shrink the iframe to the booking page's reported content height.
        var self = this;
        this._onMessage = function (e) {
          if (e.origin !== SESH_ORIGIN) return;
          if (e.source !== self._iframe.contentWindow) return;
          var data = e.data;
          if (
            data &&
            data.type === RESIZE_TYPE &&
            typeof data.height === "number" &&
            isFinite(data.height)
          ) {
            self._iframe.style.height = Math.ceil(data.height) + "px";
          }
        };
        window.addEventListener("message", this._onMessage);
      }

      disconnectedCallback() {
        if (this._onMessage) {
          window.removeEventListener("message", this._onMessage);
          this._onMessage = null;
        }
      }
    },
  );
})();
