// Streams the game bundle (game.js) to report preload progress (0-100) to the Famobi SDK,
// then lets GameInterface.init() load and run it, and starts the game once it resolves.
// The SDK's own fetch of the bundle is served from the HTTP cache.
(function () {
  var GAME_FILE = 'game.js';
  // Uncompressed size of game.js, injected at build time (scripts/inject-game-size.mjs).
  // Stays 0 when not built; Content-Length is used instead.
  var GAME_SIZE = Number('__GAME_SIZE__') || 0;
  var lastProgress = -1;

  // Progress must be an integer in 0-100 and never repeat.
  function reportProgress(value) {
    var progress = Math.max(0, Math.min(100, Math.floor(value)));
    if (progress === lastProgress) return;
    lastProgress = progress;
    window.GameInterface.sendPreloadProgress(progress);
  }

  function preloadWithProgress() {
    reportProgress(0);
    return fetch(GAME_FILE)
      .then(function (response) {
        if (!response.ok) throw new Error('Failed to fetch ' + GAME_FILE);
        // The reader counts decompressed bytes, so Content-Length only matches when the
        // response is not compressed. Otherwise use the size injected at build time.
        var compressed = !!response.headers.get('Content-Encoding');
        var total = GAME_SIZE || (compressed ? 0 : Number(response.headers.get('Content-Length')) || 0);
        // Without a known size only 0 and 100 are reported.
        if (!response.body || !total) {
          return response.arrayBuffer();
        }
        var reader = response.body.getReader();
        var received = 0;
        return (function pump() {
          return reader.read().then(function (result) {
            if (result.done) return;
            received += result.value.length;
            // Hold at 99 until the download is complete.
            reportProgress(Math.min(99, (received / total) * 100));
            return pump();
          });
        })();
      })
      .then(function () {
        reportProgress(100);
      })
      .catch(function (error) {
        // Progress is best effort; init() below surfaces real load failures.
        console.warn('Preload progress unavailable.', error);
      });
  }

  function showLoadError(error) {
    console.error('Game failed to load.', error);
    var render = function () {
      document.getElementById('overlay-eyebrow').textContent = 'Something went wrong';
      document.getElementById('overlay-title').textContent = 'Could not load';
      document.getElementById('overlay-copy').textContent =
        'The game failed to load. Check your connection and try again.';
      document.getElementById('loading-spinner').hidden = true;
      document.getElementById('game-overlay').hidden = false;
      document.querySelector('.overlay-card').setAttribute('aria-busy', 'false');
      var retry = document.getElementById('retry-action');
      retry.hidden = false;
      retry.addEventListener('click', function () {
        window.location.reload();
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render);
    } else {
      render();
    }
  }

  preloadWithProgress()
    .then(function () {
      return window.GameInterface.init([GAME_FILE]);
    })
    .then(function () {
      return window.NeonSnake;
    })
    .then(function (game) {
      if (!game || typeof game.start !== 'function') {
        throw new Error('game.js loaded but did not expose a start() function.');
      }
      game.start();
    })
    .catch(showLoadError);
})();
