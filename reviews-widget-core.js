/* reviews-widget-core.js — Fresh Reviews Popup (widget core)
 *
 * A framework-free Google reviews popup: a corner badge showing the live
 * Google rating and total review count, expanding into a scrollable list of
 * the business's most recent Google reviews.
 *
 * This core is site-agnostic. Everything site-specific arrives via config:
 *
 *   FreshReviewsPopup.mount({
 *     endpoint: 'https://api.example.com/api/reviews', // required
 *     placeId: 'ChIJ...',          // optional; appended as ?placeId=
 *     businessName: 'My Business', // optional; used in aria-labels/links
 *     googleReviewsUrl: '',        // optional; overrides the backend's link
 *     fallback: { rating: 5.0, count: 0 }, // shown only if endpoint fails
 *     colors: { primary: '#1B3A56', accent: '#5A8CB2', star: '#F68B1E' },
 *     corner: 'bottom-left',       // or 'bottom-right'
 *     offset: 16,                  // px from the corner
 *     zIndex: 2147483000
 *   });
 *
 * mount() returns a handle: { destroy() }.
 *
 * If window.FreshReviewsPopupConfig is set before this file loads, the
 * widget auto-mounts with that config (handy for a plain <script> embed).
 *
 * Data contract: GET endpoint[?placeId=] must return JSON shaped like
 *   { name, rating, count, googleMapsUri, reviews: [
 *       { author, photo, rating, text, publishTime, relativeTime } ],
 *     fetchedAt }
 * which is exactly what server/ returns.
 *
 * Google attribution: the badge always shows the Google "G" mark and the
 * panel always links out with "See all reviews on Google". Reviews are
 * rendered unfiltered, exactly as the backend returns them (Google policy).
 */
(function (global) {
  'use strict';

  var GOOGLE_G =
    '<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">' +
    '<path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>' +
    '<path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>' +
    '<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>' +
    '<path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>' +
    '</svg>';

  var GOOGLE_G_SMALL =
    '<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';

  var DEFAULTS = {
    endpoint: '',
    placeId: '',
    businessName: '',
    googleReviewsUrl: '',
    fallback: { rating: 5.0, count: 0 },
    colors: { primary: '#1B3A56', accent: '#5A8CB2', star: '#F68B1E' },
    corner: 'bottom-left',
    offset: 16,
    zIndex: 2147483000
  };

  function mergeConfig(user) {
    var cfg = {};
    var k;
    for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
    user = user || {};
    for (k in user) {
      if (k === 'colors' || k === 'fallback') {
        var merged = {};
        var j;
        for (j in DEFAULTS[k]) merged[j] = DEFAULTS[k][j];
        for (j in (user[k] || {})) merged[j] = user[k][j];
        cfg[k] = merged;
      } else {
        cfg[k] = user[k];
      }
    }
    return cfg;
  }

  function starRow(rating, size, starColor) {
    var full = Math.round(rating);
    var out = '<span class="stars" role="img" aria-label="' + rating + ' out of 5 stars">';
    for (var i = 1; i <= 5; i++) {
      out += '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' +
        '<path fill="' + (i <= full ? starColor : '#D9D9D9') + '" d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
    }
    return out + '</span>';
  }

  var AVATAR_COLORS = ['#5A8CB2', '#1B3A56', '#F68B1E', '#4E7A51', '#7A5A8C', '#A85751', '#51707A', '#8C7135'];
  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    var s = (parts[0] || '').charAt(0);
    if (parts.length > 1) s += parts[parts.length - 1].charAt(0);
    return s.toUpperCase() || 'G';
  }

  function buildCss(colors) {
    return [
      ':host { all: initial; }',
      '.wrap { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #222; }',
      '.card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.22); overflow: hidden; width: 340px; max-width: calc(100vw - 24px); animation: frp-fade .5s ease; }',
      '@keyframes frp-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }',
      '.head { display: flex; align-items: stretch; cursor: pointer; background: #fff; border: 0; width: 100%; text-align: left; padding: 0; font: inherit; }',
      '.cell { display: flex; align-items: center; justify-content: center; padding: 12px 10px; }',
      '.cell.g { padding-left: 16px; }',
      '.cell.mid { flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; }',
      '.divider { width: 1px; background: #E3E3E3; margin: 10px 0; }',
      '.rating { font-size: 26px; font-weight: 700; color: ' + colors.star + '; line-height: 1; }',
      '.rating-row { display: flex; align-items: center; gap: 8px; }',
      '.count { font-size: 12px; font-weight: 700; letter-spacing: .4px; color: #111; text-transform: uppercase; }',
      '.stars { display: inline-flex; gap: 1px; }',
      '.chev { transition: transform .25s ease; color: #9AA0A6; display: flex; }',
      '.open .chev { transform: rotate(180deg); }',
      '.panel { display: none; border-top: 1px solid #ECECEC; }',
      '.open .panel { display: block; }',
      '.list { max-height: 52vh; overflow-y: auto; padding: 6px 0; }',
      '.review { padding: 12px 16px; border-bottom: 1px solid #F1F1F1; }',
      '.review:last-child { border-bottom: 0; }',
      '.r-top { display: flex; align-items: center; gap: 10px; }',
      '.avatar { width: 36px; height: 36px; border-radius: 50%; flex: 0 0 36px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; font-size: 14px; overflow: hidden; }',
      '.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.r-name { font-weight: 600; font-size: 14px; color: ' + colors.primary + '; }',
      '.r-meta { display: flex; align-items: center; gap: 6px; margin-top: 1px; }',
      '.r-time { font-size: 12px; color: #777; }',
      '.r-g { margin-left: auto; flex: 0 0 auto; }',
      '.r-text { font-size: 13.5px; line-height: 1.45; margin-top: 8px; color: #333; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }',
      '.r-text.expanded { display: block; }',
      '.more { background: none; border: 0; padding: 4px 0 0; color: ' + colors.accent + '; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }',
      '.foot { padding: 10px 16px 14px; }',
      '.foot a { color: ' + colors.accent + '; font-weight: 600; font-size: 13.5px; text-decoration: none; }',
      '.foot a:hover { text-decoration: underline; }',
      '.empty { padding: 14px 16px; font-size: 13.5px; color: #444; }',
      '@media (max-width: 560px) { .card { width: auto; } .list { max-height: 48vh; } }'
    ].join('\n');
  }

  function mount(userConfig) {
    var cfg = mergeConfig(userConfig);
    if (!cfg.endpoint) {
      if (global.console) console.warn('[FreshReviewsPopup] config.endpoint is required; widget not mounted.');
      return { destroy: function () {} };
    }

    var destroyed = false;
    var host = null;
    var onKeyDown = null;

    function reviewsUrlFor(data) {
      if (cfg.googleReviewsUrl) return cfg.googleReviewsUrl;
      if (data && data.googleMapsUri) return data.googleMapsUri;
      var q = cfg.businessName || (data && data.name) || '';
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || 'Google reviews');
    }

    function build(data) {
      if (destroyed) return;
      var name = cfg.businessName || data.name || 'this business';
      var reviewsUrl = reviewsUrlFor(data);

      host = document.createElement('div');
      var side = cfg.corner === 'bottom-right' ? 'right' : 'left';
      host.style.cssText =
        'position:fixed;' + side + ':' + cfg.offset + 'px;bottom:' + cfg.offset + 'px;' +
        'z-index:' + cfg.zIndex + ';max-width:calc(100vw - 24px);';
      var root = host.attachShadow({ mode: 'open' });

      var style = document.createElement('style');
      style.textContent = buildCss(cfg.colors);
      root.appendChild(style);

      var wrap = document.createElement('div');
      wrap.className = 'wrap';
      var card = document.createElement('div');
      card.className = 'card';
      wrap.appendChild(card);

      // Header / collapsed badge (always visible, acts as the toggle).
      var head = document.createElement('button');
      head.className = 'head';
      head.setAttribute('aria-expanded', 'false');
      head.setAttribute('aria-label', 'Google reviews for ' + name + '. Activate to read reviews.');
      var countText = data.count > 0 ? data.count + ' reviews' : 'Google reviews';
      head.innerHTML =
        '<span class="cell g">' + GOOGLE_G + '</span>' +
        '<span class="divider"></span>' +
        '<span class="cell mid">' +
          '<span class="rating-row"><span class="rating">' + Number(data.rating).toFixed(1) + '</span>' + starRow(data.rating, 17, cfg.colors.star) + '</span>' +
          '<span class="count">' + countText + '</span>' +
        '</span>' +
        '<span class="divider"></span>' +
        '<span class="cell chev"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="#9AA0A6" d="M7 14l5-5 5 5z"/></svg></span>';
      card.appendChild(head);

      // Expandable panel.
      var panel = document.createElement('div');
      panel.className = 'panel';

      var list = document.createElement('div');
      list.className = 'list';
      var reviews = (data.reviews || []).filter(function (r) { return r && (r.text || r.author); });
      if (!reviews.length) {
        var empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'See what customers are saying on Google.';
        list.appendChild(empty);
      }
      reviews.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'review';

        var top = document.createElement('div');
        top.className = 'r-top';
        var av = document.createElement('span');
        av.className = 'avatar';
        av.style.background = avatarColor(r.author || 'Guest');
        if (r.photo) {
          var img = document.createElement('img');
          img.src = r.photo;
          img.alt = '';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          img.onerror = function () { av.textContent = initials(r.author || 'Guest'); img.remove(); };
          av.appendChild(img);
        } else {
          av.textContent = initials(r.author || 'Guest');
        }
        top.appendChild(av);

        var who = document.createElement('span');
        var nm = document.createElement('div');
        nm.className = 'r-name';
        nm.textContent = r.author || 'Google guest';
        who.appendChild(nm);
        var meta = document.createElement('div');
        meta.className = 'r-meta';
        meta.innerHTML = starRow(r.rating || 5, 13, cfg.colors.star);
        var tm = document.createElement('span');
        tm.className = 'r-time';
        tm.textContent = r.relativeTime || '';
        meta.appendChild(tm);
        who.appendChild(meta);
        top.appendChild(who);

        var g = document.createElement('span');
        g.className = 'r-g';
        g.innerHTML = GOOGLE_G_SMALL;
        top.appendChild(g);
        item.appendChild(top);

        if (r.text) {
          var tx = document.createElement('div');
          tx.className = 'r-text';
          tx.textContent = r.text;
          item.appendChild(tx);
          if (r.text.length > 200) {
            var more = document.createElement('button');
            more.className = 'more';
            more.textContent = 'Show More';
            more.addEventListener('click', function () {
              var expanded = tx.classList.toggle('expanded');
              more.textContent = expanded ? 'Show Less' : 'Show More';
            });
            item.appendChild(more);
          }
        }
        list.appendChild(item);
      });
      panel.appendChild(list);

      var foot = document.createElement('div');
      foot.className = 'foot';
      var link = document.createElement('a');
      link.href = reviewsUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'See all reviews on Google';
      foot.appendChild(link);
      panel.appendChild(foot);

      card.appendChild(panel);
      root.appendChild(wrap);
      document.body.appendChild(host);

      head.addEventListener('click', function () {
        var open = card.classList.toggle('open');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      onKeyDown = function (e) {
        if (e.key === 'Escape' && card.classList.contains('open')) {
          card.classList.remove('open');
          head.setAttribute('aria-expanded', 'false');
        }
      };
      document.addEventListener('keydown', onKeyDown);
    }

    function start() {
      var url = cfg.endpoint;
      if (cfg.placeId) {
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'placeId=' + encodeURIComponent(cfg.placeId);
      }
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error('Backend answered ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data || typeof data.rating !== 'number') throw new Error('Unexpected data');
          build(data);
        })
        .catch(function () {
          build({
            name: cfg.businessName || '',
            rating: cfg.fallback.rating,
            count: cfg.fallback.count,
            reviews: [],
            googleMapsUri: ''
          });
        });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }

    return {
      destroy: function () {
        destroyed = true;
        if (onKeyDown) document.removeEventListener('keydown', onKeyDown);
        if (host && host.parentNode) host.parentNode.removeChild(host);
        host = null;
      }
    };
  }

  global.FreshReviewsPopup = { mount: mount, version: '1.0.0' };

  // Auto-boot for plain <script> embeds that set a global config first.
  if (global.FreshReviewsPopupConfig) {
    mount(global.FreshReviewsPopupConfig);
  }
})(typeof window !== 'undefined' ? window : this);
