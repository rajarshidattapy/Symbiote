# Compact knowledge-graph context

`graphify-context.mjs` turns a Graphify-compatible `graph.json` into a small, deterministic context block. It keeps only query-matching nodes and their nearby relationships, preferring `EXTRACTED` facts, and stops at the requested token budget.

Build or update the graph with Graphify, which is intentionally kept out of version control:

```powershell
graphify . --no-viz
```

Then query a bounded context block:

```powershell
node kg/graphify-context.mjs --question "How is provider state persisted?" --budget 700
```

The default graph path is `graphify-out/graph.json`; use `--graph` to select another Graphify node-link JSON file. Run `node --test kg/graphify-context.test.mjs` to verify the packer.

This module is a clean-room Node.js adaptation of Graphify's approach—local structural graphs, graph traversal, and a hard context budget—not a copy of Graphify. Graphify is Apache-2.0: <https://github.com/Graphify-Labs/graphify>.
