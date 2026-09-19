// 笔顺动画播放器：requestAnimationFrame 驱动逐笔揭示。
// 与具体渲染解耦：通过 onFrame(state) 回调，由 UI 层负责画 SVG。

export class Player {
  /**
   * @param {object} opts
   *  strokeLengths: number[] 每笔弧长（1024 坐标）
   *  onFrame: (state) => void
   *  onEnd: () => void
   */
  constructor({ strokeLengths = [], onFrame, onEnd } = {}) {
    this.lengths = strokeLengths.slice();
    this.total = this.lengths.reduce((a, b) => a + b, 0) || 1;
    this.onFrame = onFrame || (() => {});
    this.onEnd = onEnd || (() => {});
    this.speed = 1;          // 倍速：0.5 / 1 / 2
    this.loop = false;
    this.playing = false;
    // 每秒行进的弧长（按全字约 2.6 秒/倍速）
    this.unitsPerSec = this.total / 2.6;
    this.gapSec = 0.18;      // 笔间停顿
    this.elapsed = 0;        // 含停顿的累计时间
    this._last = 0;
    this._raf = 0;
    this.state = this._calc(0);
  }

  setStrokes(lengths) {
    this.pause();
    this.lengths = lengths.slice();
    this.total = this.lengths.reduce((a, b) => a + b, 0) || 1;
    this.unitsPerSec = this.total / 2.6;
    this.elapsed = 0;
    this.state = this._calc(0);
    this.onFrame(this.state);
  }

  // 各笔「开始绘制的绝对时间」
  _startTimes() {
    const starts = [];
    let t = 0;
    for (let i = 0; i < this.lengths.length; i++) {
      starts.push(t);
      t += this.lengths[i] / this.unitsPerSec;
      if (i < this.lengths.length - 1) t += this.gapSec;
    }
    return { starts, drawEnd: t };
  }

  // 由时间（秒）计算每笔进度
  _calc(time) {
    const { starts, drawEnd } = this._startTimes();
    const hold = 0.6;                       // 播完后停顿
    const totalDur = drawEnd + hold;
    let t = time;
    if (this.loop && totalDur > 0) t = t % totalDur;

    const per = this.lengths.map((len, i) => {
      const draw = len / this.unitsPerSec;
      const s = starts[i];
      if (t < s) return 0;
      if (t >= s + draw) return 1;
      return Math.max(0, Math.min(1, (t - s) / draw));
    });
    const finished = t >= drawEnd;
    return { progress: per, strokeIndex: this._activeIndex(per), finished, time: t, totalDur, drawEnd };
  }

  // 当前所在笔：优先返回正在画的笔；全部完成时返回最后一笔
  _activeIndex(per) {
    for (let i = 0; i < per.length; i++) if (per[i] > 0 && per[i] < 1) return i;
    if (per.every(p => p >= 1)) return per.length - 1;
    for (let i = 0; i < per.length; i++) if (per[i] === 0) return Math.max(0, i - 1);
    return 0;
  }

  _tick = (ts) => {
    if (!this.playing) return;
    if (!this._last) this._last = ts;
    const dt = (ts - this._last) / 1000;
    this._last = ts;
    this.elapsed += dt * this.speed;
    this.state = this._calc(this.elapsed);
    this.onFrame(this.state);
    if (this.state.finished) {
      if (this.loop) {
        // _calc 内部已做取模；finished 仅在非循环末尾稳定为真
      } else {
        this.playing = false;
        this.onEnd(this.state);
        return;
      }
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  play() {
    if (this.playing) return;
    if (this.state.finished && !this.loop) this.elapsed = 0;
    this.playing = true;
    this._last = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  pause() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  reset() {
    this.pause();
    this.elapsed = 0;
    this.state = this._calc(0);
    this.onFrame(this.state);
  }

  // 跳到某一笔（0-based），让该笔处于“刚起笔”状态（可见但未写完）
  goStroke(i) {
    this.pause();
    const n = Math.max(0, Math.min(this.lengths.length - 1, i));
    const { starts } = this._startTimes();
    const draw = this.lengths[n] / this.unitsPerSec;
    // 落在该笔绘制时长的 8% 处：前 n 笔完成、本笔刚起笔
    this.elapsed = starts[n] + Math.min(draw * 0.08, 0.03);
    this.state = this._calc(this.elapsed);
    this.onFrame(this.state);
  }

  // 单步：前进一笔；若已在最后一笔（全部完成）则回到第一笔
  next() {
    const allDone = this.state.progress.every(p => p >= 1);
    if (allDone) { this.goStroke(0); return; }
    const idx = this._activeIndex(this.state.progress);
    this.goStroke(Math.min(this.lengths.length - 1, idx + 1));
  }

  // 单步：后退一笔
  prev() {
    const idx = this._activeIndex(this.state.progress);
    this.goStroke(Math.max(0, idx - 1));
  }

  setSpeed(s) { this.speed = s; }
  setLoop(v) { this.loop = v; if (v && !this.playing) this.play(); }

  destroy() { this.pause(); }
}
