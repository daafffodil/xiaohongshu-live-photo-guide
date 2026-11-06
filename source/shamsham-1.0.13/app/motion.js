(function (root) {
  'use strict';
  const engine = root.anime;
  if (!engine) throw new Error('Animation engine is unavailable');
  const tracks = {};
  function track(name, values) {
    const target = { x: 0, y: 0, angle: 0, phase: 0, breath: 1, travel: 1, alpha: 1 };
    const options = Object.assign({ targets: target, autoplay: false, duration: 3000, easing: 'easeInOutSine' }, values);
    tracks[name] = { target, animation: engine(options) };
  }
  track('flow', { phase: [0, 1], easing: 'linear' });
  track('float', {
    x: [{ value: .85, duration: 850 }, { value: -.6, duration: 1400 }, { value: 0, duration: 750 }],
    y: [{ value: -.8, duration: 1200 }, { value: .55, duration: 1100 }, { value: 0, duration: 700 }],
    angle: [{ value: -.6, duration: 1000 }, { value: .7, duration: 1300 }, { value: 0, duration: 700 }],
    breath: [{ value: 1.035, duration: 1500 }, { value: 1, duration: 1500 }]
  });
  track('wave', {
    y: [{ value: -1, duration: 750 }, { value: 1, duration: 1500 }, { value: 0, duration: 750 }],
    x: [{ value: .5, duration: 1500 }, { value: 0, duration: 1500 }]
  });
  track('orbit', { phase: [0, 1], easing: 'linear' });
  // Start on the complete phrase so the live-photo cover is readable.
  track('path', {
    travel: [{ value: 1, duration: 1099 }, { value: 0, duration: 1 },
      { value: 1, duration: 1350, easing: 'easeOutCubic' }, { value: 1, duration: 550 }],
    alpha: [{ value: 1, duration: 850 }, { value: 0, duration: 250 },
      { value: 1, duration: 200 }, { value: 1, duration: 1700 }]
  });
  track('breathe', {
    breath: [{ value: 1.12, duration: 1500 }, { value: 1, duration: 1500 }]
  });
  track('sway', {
    angle: [{ value: -1, duration: 750 }, { value: 1, duration: 1500 }, { value: 0, duration: 750 }]
  });
  track('bounce', {
    y: [{ value: 0, duration: 650 }, { value: -1, duration: 380, easing: 'easeOutCubic' },
      { value: 0, duration: 460, easing: 'easeInCubic' }, { value: -.2, duration: 180, easing: 'easeOutSine' },
      { value: 0, duration: 230, easing: 'easeInSine' }, { value: 0, duration: 1100 }]
  });
  root.ShamMotion = {
    engine: 'anime.js 3.2.2',
    sample(name, seconds, offset) {
      const cycle = ((seconds / 3 + (offset || 0)) % 1 + 1) % 1;
      const item = tracks[name]; item.animation.seek(cycle * 3000);
      return Object.assign({}, item.target);
    }
  };
})(window);
