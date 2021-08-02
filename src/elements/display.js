

import { html, LitElement } from 'lit';
import { sharedGame } from '../shared';
import {repeat} from 'lit/directives/repeat.js';
import * as graph from '../graph';
import * as game from '../game';

export class TrainDisplayElement extends LitElement {
  #game = sharedGame;

  constructor() {
    super();
    this.#game.addEventListener('update', () => this.requestUpdate());
  }

  render() {
    const g = /** @type {graph.Graph} */ (this.#game.graph);
    const edges = g.all();

    const inner = repeat(edges, ({data: {id}}) => id, (edge) => {

      /** @type {(node: graph.Node) => any} */
      const renderNode = (node) => {
        const inner = node.pairs.map(([a, b]) => {
          return `${a.edge}/${a.dir}...${b.edge}/${b.dir}`;
        });
        return `${node.id}: ` + inner.join(', ');
      };

      /** @type {any[]} */
      const render = [];
      const data = edge.data;

      render.push(`(${renderNode(data.node[0])})`);

      for (let i = 0; i < data.virt.length - 1; ++i) {
        const nodeAfter = data.node[i+1];

        render.push(` ${data.virt[i]}- (${renderNode(nodeAfter)})`);
      }

      return html`<div>${data.id} [${edge.data.length}, other=${[...edge.data.other].join(',')}]: ${render.join('')}</div>`;
    });

    return html`${inner}`;
  }

}

customElements.define('tg-display', TrainDisplayElement);
