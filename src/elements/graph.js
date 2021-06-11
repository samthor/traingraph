

import { sharedGame } from '../shared';
import { TrainGame, zeroLineSearch } from '../game';
import * as types from '../types';




export class TrainGraphElement extends HTMLElement {
  #game = sharedGame;

  #ratio = 1.0;
  #state = '';

  /** @type {SVGCircleElement} */
  #nearestCircle;

  /** @type {SVGLineElement} */
  #pendingLine;

  /** @type {SVGElement} */
  #groupLines;

  /** @type {types.LineSearch} */
  #startPoint = zeroLineSearch;

  /** @type {types.LineSearch} */
  #nearestPoint = zeroLineSearch;

  constructor() {
    super();

    const root = this.attachShadow({mode: 'open'});

    root.innerHTML = `
<style>
circle {
  fill: red;
}
line {
  stroke: black;
}
circle.line {
  fill: green;
}
circle.node {
  fill: blue;
}
</style>
<svg>
  <circle cx="50" cy="50" r="4" id="nearest" />
  <line id="line" />
  <g id="lines"></g>
</svg>
    `;

    const s = /** @type {SVGSVGElement} */ (root.querySelector('svg'));
    this.#nearestCircle = /** @type {SVGCircleElement} */ (s.getElementById('nearest'));
    this.#pendingLine = /** @type {SVGLineElement} */ (s.getElementById('line'));
    this.#groupLines = /** @type {SVGElement} */ (s.getElementById('lines'));

    const ro = new ResizeObserver(() => {
      s.setAttribute('width', this.offsetWidth + 'px');
      s.setAttribute('height', this.offsetHeight + 'px');

      if (this.offsetHeight > this.offsetWidth) {
        this.#ratio = 1 / this.offsetWidth;
      } else {
        this.#ratio = 1 / this.offsetHeight;
      }

      this.#onUpdateGame();
    });
    ro.observe(this);

    s.addEventListener('pointermove', this.#onPointerMove);
    s.addEventListener('pointerdown', this.#onPointerDown);

    this.#game.addEventListener('update', this.#onUpdateGame);
  }

  #onUpdateGame = () => {
    this.#groupLines.textContent = '';

    for (const line of this.#game.lines) {
      const e = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      e.setAttribute('x1', line.low.x / this.#ratio + 'px');
      e.setAttribute('y1', line.low.y / this.#ratio + 'px');
      e.setAttribute('x2', line.high.x / this.#ratio + 'px');
      e.setAttribute('y2', line.high.y / this.#ratio + 'px');
      this.#groupLines.append(e);
    }
  };

  /**
   * @param {PointerEvent} event
   */
  #adjustEvent = (event) => {
    const x = event.offsetX * this.#ratio;
    const y = event.offsetY * this.#ratio;
    return this.#game.nearest({x, y}, 0.04);
  };

  /**
   * @param {SVGCircleElement} circ
   * @param {types.LineSearch} s
   */
  #configureCircle = (circ, s) => {
    circ.setAttribute('cx', s.x / this.#ratio + 'px');
    circ.setAttribute('cy', s.y / this.#ratio + 'px');

    let className = '';
    if (s.line) {
      className = 'line';
      if (s.nodeIndex !== -1) {
        className = 'node';
      }
    }
    circ.setAttribute('class', className);
  };

  /**
   * @param {PointerEvent} event
   */
  #onPointerMove = (event) => {
    const p = this.#adjustEvent(event);
    this.#nearestPoint = p;

    this.#configureCircle(this.#nearestCircle, p);

    if (this.#state === 'pending') {
      this.#pendingLine.setAttribute('x2', p.x / this.#ratio + 'px');
      this.#pendingLine.setAttribute('y2', p.y / this.#ratio + 'px');
    }
  };

  /**
   * @param {PointerEvent} event
   */
  #onPointerDown = (event) => {
    if (event.button) {
      this.#state = 'abort';
    }

    // switch to line-drawing
    switch (this.#state) {
      case '':
        this.#state = 'pending';

        const p = this.#nearestPoint;
        this.#pendingLine.setAttribute('x1', p.x / this.#ratio + 'px');
        this.#pendingLine.setAttribute('y1', p.y / this.#ratio + 'px');
        this.#startPoint = p;
        break;

      case 'pending':
        const other = this.#adjustEvent(event);
        this.#game.add(this.#startPoint, other);
        // fall-through

      case 'abort':
        this.#state = '';
        this.#pendingLine.removeAttribute('x1');
        this.#pendingLine.removeAttribute('y1');
        this.#pendingLine.removeAttribute('x2');
        this.#pendingLine.removeAttribute('y2');
    }

    this.#onPointerMove(event);
  };

}

customElements.define('tg-graph', TrainGraphElement);
