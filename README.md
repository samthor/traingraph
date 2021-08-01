Work in progress train graph + game demo on top.

# Play

Run with `dhost` or something that will rewrite your ESM imports:

```js
dhost -m
```

Focus and tap "a" to add a line.
Use your mouse and click to finish the line (potentially joining to other lines).

Tap "s" to add a train (it's basically a snake).
Trains just bounce around forever.

Tap "p" to start pathfinding when focused on a line.
This is just a demo and nothing uses this yet.

## Configure

Some constants are in "src/shared.js", around units and so on.
