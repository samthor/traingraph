

import { sharedGame } from '../shared';
import { TrainGame, zeroLineSearch } from '../game';
import * as types from '../types';




export class TrainGraphElement extends HTMLElement {
  #game = sharedGame;

  #ratio = 1.0;
  #state = '';

  /** @type {SVGCircleElement} */
  #startCircle;

  /** @type {SVGCircleElement} */
  #nearestCircle;

  /** @type {SVGLineElement} */
  #pendingLine;

  /** @type {SVGElement} */
  #groupLines;

  /** @type {SVGElement} */
  #joinLines;

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
*[hidden] {
  opacity: 0;
}
#joins {
  opacity: 0.5;
}
#joins line {
  stroke: blue;
  stroke-width: 4px;
  stroke-linecap: round;
}
</style>
<svg>
  <circle r="4" id="start" />
  <circle r="4" id="nearest" />
  <line id="line" />
  <g id="lines"></g>
  <g id="joins"></g>
</svg>
    `;

    const s = /** @type {SVGSVGElement} */ (root.querySelector('svg'));
    this.#startCircle = /** @type {SVGCircleElement} */ (s.getElementById('start'));
    this.#nearestCircle = /** @type {SVGCircleElement} */ (s.getElementById('nearest'));
    this.#pendingLine = /** @type {SVGLineElement} */ (s.getElementById('line'));
    this.#groupLines = /** @type {SVGElement} */ (s.getElementById('lines'));
    this.#joinLines = /** @type {SVGElement} */ (s.getElementById('joins'));

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
   * @param {types.LineSearch?} s
   */
  #configureCircle = (circ, s) => {
    circ.toggleAttribute('hidden', s === null);
    if (s === null) {
      return;
    }

    circ.setAttribute('cx', s.x / this.#ratio + 'px');
    circ.setAttribute('cy', s.y / this.#ratio + 'px');

    let className = '';
    if (s.line) {
      className = 'line';
      if (s.nodeId) {
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
    this.#joinLines.textContent = '';

    if (this.#state !== 'pending') {
      this.#configureCircle(this.#startCircle, p);
      this.#configureCircle(this.#nearestCircle, null);
      return;
    }

    this.#pendingLine.setAttribute('x2', p.x / this.#ratio + 'px');
    this.#pendingLine.setAttribute('y2', p.y / this.#ratio + 'px');

    this.#configureCircle(this.#startCircle, this.#startPoint);
    this.#configureCircle(this.#nearestCircle, p);

    /** @type {(root: types.Point, joins: {line: string, angle: number}[]) => void} */
    const render = (root, joins) => {
      for (const j of joins) {
        const rx = root.x / this.#ratio;
        const ry = root.y / this.#ratio;
  
        const e = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        e.setAttribute('x1', rx + 'px');
        e.setAttribute('y1', ry + 'px');
        e.setAttribute('x2', rx + (Math.cos(j.angle) * 32) + 'px');
        e.setAttribute('y2', ry + (Math.sin(j.angle) * 32) + 'px');
        this.#joinLines.append(e);
      }
    };

    // TODO: draw hints as to where joins will occur
    const joinsNearest = this.#game.dirsFor(this.#startPoint, p);
    render(p, joinsNearest);

    const joinsStart = this.#game.dirsFor(p, this.#startPoint);
    render(this.#startPoint, joinsStart);
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
