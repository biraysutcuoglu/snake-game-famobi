// The Famobi SDK loads the game bundle (game.js) and resolves once it has run,
// so the game only starts after everything it needs is in place.
(function () {
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

  window.GameInterface.init(['game.js'])
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
