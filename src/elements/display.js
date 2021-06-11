

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
    const edges = this.#game.graph.all();

    const inner = repeat(edges, ({data: {id}}) => id, (edge) => {

      /** @type {(node: graph.Node) => any} */
      const renderNode = (node) => {
        const inner = node.pairs.map(([a, b]) => {
          return `${a.edge}/${a.at}...${b.edge}/${b.at}`;
        });
        return `${node.id}: ` + inner.join(', ');
      };

      /** @type {any[]} */
      const render = [];
      const data = edge.data;

      render.push(`(${renderNode(data.node[0])})`);

      for (let i = 0; i < data.virt.length; ++i) {
        const nodeAfter = data.node[i+1];

        render.push(` ${data.virt[i].at}- (${renderNode(nodeAfter)})`);
      }

      return html`<div>${data.id} [${edge.data.length.toFixed(2)}]: ${render.join('')}</div>`;
    });

    return html`${inner}`;
  }

}

customElements.define('tg-display', TrainDisplayElement);
