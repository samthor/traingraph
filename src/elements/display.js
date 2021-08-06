

import { html, LitElement } from 'lit';
import { sharedGame } from '../shared';
import { repeat } from 'lit/directives/repeat.js';

export class TrainDisplayElement extends LitElement {
  #game = sharedGame;

  constructor() {
    super();
    this.#game.addEventListener('update', () => this.requestUpdate());
  }

  render() {
    const g = this.#game.graph;

    const nodes = g.allNodes();
    const inner = repeat(nodes, (node) => {
      return html`
<div>
  ${node}
  (
    conn: ${[...g.connectAtNode(node)].map(({ other }) => other).join(',')}
    join: ${[...g.joinsAtNode(node)].map(([l, r]) => `${l}:${r}`).join(',')}
  )
</div>
`;
    });

    return html`${inner}`;
  }

}

customElements.define('tg-display', TrainDisplayElement);
