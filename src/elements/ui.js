

import { sharedGame } from '../shared';
import { zeroLineSearch } from '../game';
import * as helperMath from '../helper/math';
import * as types from '../types';
import { nodeKey } from '../helper/swap';


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
  #trainLines;

  /** @type {SVGElement} */
  #joinLines;

  /** @type {SVGElement} */
  #searchLine;

  /** @type {HTMLElement} */
  #stateElement;

  /** @type {types.LineSearch} */
  #startPoint = zeroLineSearch;

  /** @type {types.LineSearch} */
  #nearestPoint = zeroLineSearch;

  constructor() {
    super();

    const root = this.attachShadow({mode: 'open'});

    root.innerHTML = `
<style>
:host {
  display: block;
}
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
.train {
  stroke: purple;
  stroke-width: 6px;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: transparent;
  will-change: transform;
}
.trainHead {
  stroke-width: 2px;
  stroke: red;
  fill: white;
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
.outer {
  display: flex;
  flex-flow: column;
  height: 100%;
}
.outer:focus {
  outline: 0;
}
svg {
  flex-grow: 1;
}
#state {
  min-height: 32px;
  background: #eee;
  line-height: 24px;
  padding: 4px;
  box-sizing: border-box;
  pointer-events: none;
}
#search {
  fill: none;
  stroke: red;
  stroke-width: 8px;
  opacity: 0.4;
  stroke-linecap: round;
}
.outer:focus #state {
  box-shadow: 0 0 0 2px inset #3335;
}
</style>
<div class="outer" tabindex="-1">
  <svg>
    <g id="lines"></g>
    <g id="trains"></g>
    <g id="joins"></g>
    <line id="line" />
    <circle r="4" id="start" />
    <circle r="4" id="nearest" />
    <path id="search" />
  </svg>
  <div id="state"></div>
</div>
    `;

    const s = /** @type {SVGSVGElement} */ (root.querySelector('svg'));
    this.#startCircle = /** @type {SVGCircleElement} */ (s.getElementById('start'));
    this.#nearestCircle = /** @type {SVGCircleElement} */ (s.getElementById('nearest'));
    this.#pendingLine = /** @type {SVGLineElement} */ (s.getElementById('line'));
    this.#groupLines = /** @type {SVGElement} */ (s.getElementById('lines'));
    this.#trainLines = /** @type {SVGElement} */ (s.getElementById('trains'));
    this.#joinLines = /** @type {SVGElement} */ (s.getElementById('joins'));

    this.#searchLine = /** @type {SVGElement} */ (s.getElementById('search'));

    this.#stateElement = /** @type {HTMLElement} */ (root.getElementById('state'));

    const ro = new ResizeObserver(() => {
      // s.setAttribute('width', this.offsetWidth + 'px');
      // s.setAttribute('height', this.offsetHeight + 'px');

      if (this.offsetHeight > this.offsetWidth) {
        this.#ratio = 1 / this.offsetWidth;
      } else {
        this.#ratio = 1 / this.offsetHeight;
      }

      this.#onUpdateGame();
    });
    ro.observe(this);

    const holderDiv = /** @type {HTMLElement} */ (s.parentElement);
    holderDiv.addEventListener('pointermove', this.#onPointerMove);
    holderDiv.addEventListener('pointerdown', this.#onPointerDown);
    holderDiv.addEventListener('keydown', this.#onKeyDown);

    this.#game.addEventListener('update', this.#onUpdateGame);
    this.#game.addEventListener('update-train', this.#onUpdateTrainGame);
  }

  #onUpdateGame = () => {
    this.#groupLines.textContent = '';

    for (const line of this.#game.allLines()) {
      const sideA = this.#game.nodePos(line.low);
      const sideB = this.#game.nodePos(line.high);

      const e = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      e.setAttribute('x1', sideA.x / this.#ratio + 'px');
      e.setAttribute('y1', sideA.y / this.#ratio + 'px');
      e.setAttribute('x2', sideB.x / this.#ratio + 'px');
      e.setAttribute('y2', sideB.y / this.#ratio + 'px');
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
      const p = [...pairs];
      // console.warn('pairs for node', node, 'pairs', p);
      for (const [left, right] of p) {
        const leftPos = this.#game.nodePos(left);
        const rightPos = this.#game.nodePos(right);

        // move leftPos/rightPos to only be ~16px from node
        const leftAlongPos = helperMath.along(pos, leftPos, 16 * this.#ratio);
        const rightAlongPos = helperMath.along(pos, rightPos, 16 * this.#ratio);

        const e = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        e.setAttribute('d', `
M ${leftAlongPos.x / this.#ratio} ${leftAlongPos.y / this.#ratio}
S ${pos.x / this.#ratio} ${pos.y / this.#ratio}, ${rightAlongPos.x / this.#ratio} ${rightAlongPos.y / this.#ratio}
        `);
        e.setAttribute('class', 'hint');

        // Move this fancy new curved line slightly into the angle we've just created.
        const angle = helperMath.angle(leftPos, rightPos) - (Math.PI / 2);
        e.setAttribute('transform', `translate(${Math.cos(angle) * 4} ${Math.sin(angle) * 4})`);

        this.#groupLines.append(e);
      }
    }
  };

  #onUpdateTrainGame = () => {
    this.#trainLines.textContent = '';

    const raw = this.#game.trainsPoints();
    for (const {train, points} of raw) {
      const s = points.map((point, index) => {
        return `${index ? 'L' : 'M'}${point.x / this.#ratio} ${point.y / this.#ratio}`;
      }).join(' ');

      const e = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      e.setAttribute('d', s);
      e.setAttribute('class', 'train');
      this.#trainLines.append(e);

      const headPoint = points[0];
      const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circ.setAttribute('cx', `${headPoint.x / this.#ratio}`);
      circ.setAttribute('cy', `${headPoint.y / this.#ratio}`);
      circ.setAttribute('r', '5');
      circ.setAttribute('class', 'trainHead');
      this.#trainLines.append(circ);
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
    if (s.low && s.high) {
      className = 'line';
    } else if (s.node) {
      className = 'node';
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

    if (p.node) {
      console.info('at', p.node);
    }

    if (this.#state === 'path') {
      this.#configureCircle(this.#startCircle, this.#startPoint);
      this.#configureCircle(this.#nearestCircle, p);

      const fromLine = this.#startPoint.line;
      const toLine = p.line;
      if (!fromLine || !toLine) {
        return;
      }
      const from = {
        edge: fromLine.id,
        at: Math.round(this.#startPoint.offset * fromLine.length),
      };
      const to = {
        edge: toLine.id,
        at: Math.round(p.offset * toLine.length),
      };

      const path = this.#game.graph.search(from, to);
      if (!path) {
        this.#searchLine.removeAttribute('d');
        return;
      }

      const parts = path.map((at, index) => {
        const pos = this.#game.linePosLerp(at.edge, at.at);
        const key = index ? 'L' : 'M';

        return `${key} ${pos.x / this.#ratio},${pos.y / this.#ratio}`;
      });

      const e = this.#searchLine;
      e.setAttribute('d', parts.join(' '));

      return;
    }

    if (this.#state !== 'add') {
      this.#configureCircle(this.#startCircle, p);
      this.#configureCircle(this.#nearestCircle, null);
      return;
    }

    this.#pendingLine.removeAttribute('hidden');
    this.#pendingLine.setAttribute('x2', p.x / this.#ratio + 'px');
    this.#pendingLine.setAttribute('y2', p.y / this.#ratio + 'px');

    this.#configureCircle(this.#startCircle, this.#startPoint);
    this.#configureCircle(this.#nearestCircle, p);

    /** @type {(root: types.Point, joins: {node: string, angle: number}[]) => void} */
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
      return this.#abortState();
    }

    // switch to line-drawing
    switch (this.#state) {
      case 'add':
        const other = this.#adjustEvent(event);
        this.#game.add(this.#startPoint, other);
        this.#abortState();
        break;
    }

    this.#onPointerMove(event);
  };

  /**
   * @param {KeyboardEvent} event
   */
  #onKeyDown = (event) => {
    switch (event.key) {
      case 'Escape':
        this.#abortState();
        break;

      case 'a':
        if (this.#state) {
          return;
        }
        this.#setState('add');

        const p = this.#nearestPoint;
        this.#pendingLine.setAttribute('hidden', '');
        this.#pendingLine.setAttribute('x1', p.x / this.#ratio + 'px');
        this.#pendingLine.setAttribute('y1', p.y / this.#ratio + 'px');
        this.#startPoint = p;
        break;

      case 's':
        if (this.#state || !this.#nearestPoint.node) {
          // TODO: should support mid adding
          return;
        }

        this.#game.addTrain(this.#nearestPoint);
        break;

      case 'p':
        // TODO: not yet complete
        if (this.#state || !this.#nearestPoint.line) {
          return;
        }
        this.#setState('path');
        this.#startPoint = this.#nearestPoint;
        break;
    }
  };

  /**
   * @param {string} state
   */
  #setState = (state) => {
    this.#state = state;
    this.#stateElement.textContent = state;
  };

  #abortState = () => {
    this.#setState('');
    // TODO: state could should draw this itself
    this.#pendingLine.removeAttribute('x1');
    this.#pendingLine.removeAttribute('y1');
    this.#pendingLine.removeAttribute('x2');
    this.#pendingLine.removeAttribute('y2');

    this.#searchLine.removeAttribute('d');
  };

}

customElements.define('tg-ui', TrainUiElement);
