

import { sharedGame } from '../shared';
import { along, zeroLineSearch } from '../game';
import * as types from '../types';




export class TrainUiElement extends HTMLElement {
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
  stroke: #777;
  stroke-width: 2px;
  stroke-linecap: round;
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
#lines {
  opacity: 0.9;
}
#lines path.hint {
  stroke: red;
  stroke-width: 1px;
  stroke-linecap: round;
  fill: transparent;
}
#lines circle {
  fill: #333;
}
#joins {
  opacity: 0.5;
}
#joins line {
  stroke: blue;
  stroke-width: 4px;
}
</style>
<svg>
  <g id="lines"></g>
  <g id="joins"></g>
  <line id="line" />
  <circle r="4" id="start" />
  <circle r="4" id="nearest" />
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

    for (const node of this.#game.nodes) {
      const pos = this.#game.nodePos(node);
      const e = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      e.setAttribute('r', '2');
      e.setAttribute('cx', pos.x / this.#ratio + 'px');
      e.setAttribute('cy', pos.y / this.#ratio + 'px');
      this.#groupLines.append(e);

      const pairs = this.#game.pairsAtNode(node);
      pairs.forEach(([left, right]) => {
        const leftPos = this.#game.nodePos(left);
        const rightPos = this.#game.nodePos(right);

        // move leftPos/rightPos to only be ~16px from node
        const leftAlongPos = along(pos, leftPos, 16 * this.#ratio);
        const rightAlongPos = along(pos, rightPos, 16 * this.#ratio);

        const e = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        e.setAttribute('d', `
M ${leftAlongPos.x / this.#ratio} ${leftAlongPos.y / this.#ratio}
S ${pos.x / this.#ratio} ${pos.y / this.#ratio}, ${rightAlongPos.x / this.#ratio} ${rightAlongPos.y / this.#ratio}
        `);
        e.setAttribute('class', 'hint');

        // Move this fancy new curved line slightly into the angle we've just created.
        const angle = Math.atan2(leftPos.y - rightPos.y, leftPos.x - rightPos.x) - (Math.PI / 2);
        e.setAttribute('transform', `translate(${Math.cos(angle) * 4} ${Math.sin(angle) * 4})`);

        this.#groupLines.append(e);
      });

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

    // renders hints about what we'll connect to
    const joinsNearest = this.#game.dirsFor(this.#startPoint, p);
    const joinsStart = this.#game.dirsFor(p, this.#startPoint);
    render(p, joinsNearest);
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

customElements.define('tg-ui', TrainUiElement);
