#!/usr/bin/env node
/**
 * A small, dependency-free reader for Graphify's node-link graph.json format.
 *
 * It deliberately does not build a graph or call an LLM. Graphify owns the
 * extraction; this module turns its persisted graph into bounded prompt context.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORD = /[a-z0-9_./-]{2,}/gi;
const STOP_WORDS = new Set(['about', 'and', 'are', 'does', 'from', 'how', 'into', 'that', 'the', 'this', 'use', 'what', 'when', 'where', 'which', 'with']);

export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function terms(text) {
  return [...new Set((text.toLowerCase().match(WORD) ?? []).filter(word => word.length > 1 && !STOP_WORDS.has(word)))];
}

function display(node) {
  return String(node.label ?? node.id ?? 'unknown');
}

function location(node) {
  const file = typeof node.source_file === 'string' ? node.source_file : '';
  const line = typeof node.source_location === 'string' ? ` ${node.source_location}` : '';
  return `${file}${line}`.trim();
}

/** Builds a compact, deterministic context block from Graphify node-link JSON. */
export function packGraphContext(graph, question, options = {}) {
  const budget = options.tokenBudget ?? 700;
  const depth = options.depth ?? 2;
  if (!Number.isInteger(budget) || budget < 80) throw new Error('tokenBudget must be an integer of at least 80');
  if (!Number.isInteger(depth) || depth < 0 || depth > 5) throw new Error('depth must be an integer between 0 and 5');

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph.links) ? graph.links : Array.isArray(graph.edges) ? graph.edges : [];
  const byId = new Map(nodes.filter(node => node && node.id !== undefined).map(node => [String(node.id), node]));
  const wanted = terms(question);
  const score = (node) => {
    const identity = `${display(node)} ${node.id ?? ''}`.toLowerCase();
    const identityTerms = terms(identity);
    const path = String(node.source_file ?? '').toLowerCase();
    return wanted.reduce((total, term) => total +
      (identity === term ? 12 : identityTerms.includes(term) ? 9 : identity.includes(term) ? 5 :
        identityTerms.some(candidate => candidate.length >= 4 && (candidate.startsWith(term) || term.startsWith(candidate))) ? 3 :
          path.includes(term) ? 1 : 0), 0);
  };
  const ranked = [...byId.values()].map(node => ({ node, score: score(node) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || display(a.node).localeCompare(display(b.node)))
    .slice(0, 8);
  if (!ranked.length) return { text: '', tokens: 0, nodes: 0, edges: 0 };

  const adjacency = new Map();
  for (const link of links) {
    if (!link) continue;
    const source = String(link.source ?? link._src ?? '');
    const target = String(link.target ?? link._tgt ?? '');
    if (!byId.has(source) || !byId.has(target)) continue;
    const record = { source, target, relation: String(link.relation ?? link.type ?? 'relates_to'), confidence: String(link.confidence ?? 'UNKNOWN') };
    for (const [from, to] of [[source, target], [target, source]]) {
      const list = adjacency.get(from) ?? [];
      list.push({ ...record, other: to });
      adjacency.set(from, list);
    }
  }

  const selected = new Set(ranked.map(row => String(row.node.id)));
  const selectedOrder = ranked.map(row => String(row.node.id));
  const queue = ranked.map(row => ({ id: String(row.node.id), level: 0 }));
  const selectedEdges = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.level >= depth) continue;
    const outgoing = (adjacency.get(current.id) ?? []).sort((a, b) =>
      (a.confidence === 'EXTRACTED' ? -1 : 0) - (b.confidence === 'EXTRACTED' ? -1 : 0) || a.other.localeCompare(b.other));
    for (const edge of outgoing) {
      if (selectedEdges.length >= 48) break;
      selectedEdges.push(edge);
      if (!selected.has(edge.other) && selected.size < 28) {
        selected.add(edge.other);
        selectedOrder.push(edge.other);
        queue.push({ id: edge.other, level: current.level + 1 });
      }
    }
  }

  const lines = ['[CODE_KG: deterministic Graphify context; source facts only]'];
  const nodeBudget = Math.floor(budget * 0.7);
  const usedNodes = selectedOrder.map(id => byId.get(id)).filter(Boolean);
  for (const node of usedNodes) {
    const line = `N ${display(node)}${location(node) ? ` @ ${location(node)}` : ''}`;
    if (estimateTokens(`${lines.join('\n')}\n${line}`) > nodeBudget) break;
    lines.push(line);
  }
  const admitted = new Set(usedNodes.slice(0, lines.filter(line => line.startsWith('N ')).length).map(node => String(node.id)));
  for (const edge of selectedEdges) {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target || !admitted.has(String(source.id)) || !admitted.has(String(target.id))) continue;
    const line = `E ${display(source)} --${edge.relation}/${edge.confidence}--> ${display(target)}`;
    if (estimateTokens(`${lines.join('\n')}\n${line}`) > budget) break;
    lines.push(line);
  }
  const text = lines.join('\n');
  return { text, tokens: estimateTokens(text), nodes: lines.filter(line => line.startsWith('N ')).length, edges: lines.filter(line => line.startsWith('E ')).length };
}

function usage() {
  return 'Usage: node kg/graphify-context.mjs --question "..." [--graph graphify-out/graph.json] [--budget 700] [--depth 2]';
}

async function main(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) args.set(argv[index], argv[index + 1]);
  if (args.has('--help') || !args.get('--question')) throw new Error(usage());
  const graphPath = resolve(args.get('--graph') ?? 'graphify-out/graph.json');
  const graph = JSON.parse(await readFile(graphPath, 'utf8'));
  const result = packGraphContext(graph, args.get('--question'), {
    tokenBudget: args.has('--budget') ? Number(args.get('--budget')) : undefined,
    depth: args.has('--depth') ? Number(args.get('--depth')) : undefined,
  });
  process.stdout.write(result.text ? `${result.text}\n\n[~${result.tokens} tokens; ${result.nodes} nodes; ${result.edges} edges]\n` : 'No matching graph context.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
