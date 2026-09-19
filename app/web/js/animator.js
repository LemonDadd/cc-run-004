// animator.js - renders one character in an SVG and plays stroke-by-stroke animation
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const DIM = 1024;
  const STROKE_W = 124;

  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  }

  // Create the SVG for a character (outlines + median draw layer).
  // opts: { showOutline, outlineOpacity, showGrid(false), color }
  function buildSvg(strokes, opts) {
    opts = opts || {};
    const svg = el('svg', {
      viewBox: `0 0 ${DIM} ${DIM}`,
      class: 'hanzi-svg',
    });
    // Source data uses y-up coordinates; flip vertically to SVG y-down.
    const flip = `matrix(1 0 0 -1 0 ${DIM})`;
    const outlineG = el('g', { class: 'outline-layer', transform: flip });
    const guideG = el('g', { class: 'guide-layer', transform: flip, style: 'display:none' });
    const drawG = el('g', { class: 'draw-layer', transform: flip });
    svg.appendChild(outlineG);
    svg.appendChild(guideG);
    svg.appendChild(drawG);

    const outlineNodes = [];
    const guideNodes = [];
    const drawNodes = [];
    const medians = [];

    strokes.forEach((s, i) => {
      const d = StrokeData.toPathD(s.segments);
      // medians already run pen-start -> pen-end
      const median = s.median;
      const shape = el('path', {
        d,
        fill: '#9aa3ab',
        'fill-opacity': opts.outlineOpacity != null ? opts.outlineOpacity : 0.16,
        stroke: 'none',
      });
      outlineG.appendChild(shape);
      outlineNodes.push(shape);

      const md = StrokeData.medianD(median);
      const len = StrokeData.polyLen(median);

      const guide = el('path', {
        d: md,
        fill: 'none',
        stroke: '#d95a63',
        'stroke-width': 6,
        'stroke-linecap': 'round',
        'stroke-dasharray': '4 10',
        opacity: 0.7,
      });
      guideG.appendChild(guide);
      guideNodes.push(guide);

      const pen = el('path', {
        d: md,
        fill: 'none',
        stroke: opts.color || '#2b2f36',
        'stroke-width': STROKE_W,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'pathLength': Math.round(len),
        'stroke-dasharray': len,
        'stroke-dashoffset': len,
      });
      drawG.appendChild(pen);
      drawNodes.push(pen);
      medians.push({ d: md, len });
    });

    return {
      svg, outlineG, guideG, drawG, outlineNodes, guideNodes, drawNodes, medians,
      count: strokes.length,
    };
  }

  // Player drives a built scene.
  // state.progress = overall 0..count (integer part = completed strokes)
  class Player {
    constructor(scene, opts) {
      this.scene = scene;
      this.count = scene.count;
      // ms per stroke baseline
      this.strokeMs = opts.strokeMs || 900;
      this.pauseMs = opts.pauseMs || 260;
      this.onChange = opts.onChange || function () {};
      this.playing = false;
      this.loop = !!opts.loop;
      this.progress = 0; // 0..count
      this.rafId = 0;
      this.lastT = 0;
      this._apply();
    }

    setSpeed(speed) {
      // speed 0.25 .. 3 ; higher => faster
      this.speed = speed;
    }

    play() {
      if (this.playing) return;
      if (this.progress >= this.count) this.progress = 0;
      this.playing = true;
      this.lastT = performance.now();
      this.rafId = requestAnimationFrame(this._tick);
      this.onChange();
    }

    pause() {
      this.playing = false;
      cancelAnimationFrame(this.rafId);
      this.onChange();
    }

    toggle() {
      this.playing ? this.pause() : this.play();
    }

    reset() {
      this.pause();
      this.setProgress(0);
    }

    // advance one whole stroke
    stepForward() {
      this.pause();
      this.setProgress(Math.min(this.count, Math.floor(this.progress) + 1));
    }

    stepBack() {
      this.pause();
      this.setProgress(Math.max(0, Math.ceil(this.progress) - 1));
    }

    setProgress(p) {
      this.progress = Math.max(0, Math.min(this.count, p));
      this._apply();
      this.onChange();
    }

    _tick = (t) => {
      if (!this.playing) return;
      const dt = t - this.lastT;
      this.lastT = t;
      this.progress += (dt * (this.speed || 1)) / this.strokeMs;
      if (this.progress >= this.count) {
        if (this.loop) {
          this.progress = this.progress % this.count;
        } else {
          this.progress = this.count;
          this.playing = false;
          this._apply();
          this.onChange();
          return;
        }
      }
      this._apply();
      this.onChange();
      this.rafId = requestAnimationFrame(this._tick);
    };

    _apply() {
      const p = this.progress;
      const { drawNodes, medians } = this.scene;
      for (let i = 0; i < this.count; i++) {
        const node = drawNodes[i];
        if (p >= i + 1) {
          node.style.strokeDashoffset = '0';
        } else if (p > i) {
          const local = p - i; // 0..1 within stroke
          node.style.strokeDashoffset = String(medians[i].len * (1 - local));
        } else {
          node.style.strokeDashoffset = String(medians[i].len);
        }
      }
    }

    destroy() {
      cancelAnimationFrame(this.rafId);
      this.playing = false;
    }
  }

  // Static render of a character at arbitrary progress (for sheets/thumbnails).
  function renderStatic(svg, strokes, progress, opts) {
    const scene = buildSvg(strokes, opts);
    return scene;
  }

  global.Animator = { NS, DIM, STROKE_W, el, buildSvg, Player };
})(window);
