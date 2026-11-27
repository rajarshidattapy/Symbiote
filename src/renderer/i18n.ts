/** Kept broad for callers that retain an old saved preference; it always resolves to English. */
export type Language = string;
const language: Language = 'en';

/** The interface is English-only, irrespective of the operating-system language. */
export function systemLanguage(_preferred: readonly string[]): Language { return 'en'; }

export function currentLanguage(): Language { return language; }

const languageListeners = new Set<() => void>();
/** Runs after each language change, for copy that leaves this document (#855). */
export function onLanguageChange(listener: () => void): () => void {
  languageListeners.add(listener);
  return () => { languageListeners.delete(listener); };
}

function fill(text: string, args: readonly unknown[]): string {
  return text.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < args.length ? String(args[Number(index)]) : match);
}

/** Translate only app-authored copy at explicit call sites. Arguments remain verbatim. */
export function t(source: string, args: readonly unknown[] = []): string {
  return fill(source, args);
}

/** English has one singular form and one plural form. */
export function pluralForms(_locale: Language): Intl.LDMLPluralRule[] { return ['one']; }

/**
 * A count and what it counts in English. `count` is `{0}` unless `args` says otherwise.
 */
export function tn(one: string, other: string, count: number, args: readonly unknown[] = [count]): string {
  return fill(count === 1 ? one : other, args);
}

type Property = 'textContent' | 'title' | 'placeholder' | 'aria-label' | 'aria-valuetext' | 'data-usage-hint' | 'data-empty';
type Binding = { read: () => string; last: string };
const bindings = new WeakMap<Node, Map<Property, Binding>>();

function read(node: Node, property: Property): string | null {
  return property === 'textContent' ? node.textContent : (node as Element).getAttribute(property);
}
function write(node: Node, property: Property, value: string): void {
  if (property === 'textContent') node.textContent = value;
  else (node as Element).setAttribute(property, value);
}

/** Bind the existing node, never reconstruct controls, drafts, icons or chat history. */
export function ui<T extends Node>(node: T, property: Property, value: () => string): T {
  let properties = bindings.get(node);
  if (!properties) {
    bindings.set(node, properties = new Map());
  }
  const last = value();
  properties.set(property, { read: value, last });
  write(node, property, last);
  return node;
}

export function uiText(value: () => string): Text {
  return ui(document.createTextNode(''), 'textContent', value);
}

export function setLanguage(_next: Language): void {
  document.documentElement.lang = 'en';
  for (const listener of languageListeners) {
    try { listener(); } catch { /* One listener cannot block the repaint below. */ }
  }
  // The document owns the live labels, including hidden settings and collapsed
  // history. Do not index every label ever created: sweeping WeakRefs during
  // rendering keeps their detached DOM trees alive until the job ends and makes
  // each repaint revisit accumulated history. Bindings alone do not retain nodes.
  const walker = document.createTreeWalker(document.body, 1 | 4 /* elements + text */);
  do {
    const node = walker.currentNode;
    for (const [property, binding] of bindings.get(node) ?? []) {
      // A renderer may replace a placeholder with an authored title or an error.
      // That newer value owns the node; a language change cannot overwrite it.
      if (read(node, property) !== binding.last) { bindings.get(node)?.delete(property); continue; }
      binding.last = binding.read();
      write(node, property, binding.last);
    }
  } while (walker.nextNode());
}

/** Run once on the static shell, before any user/provider content is inserted. */
export function initLanguage(): void {
  document.documentElement.lang = 'en';
}
