/** A minimal DOM: enough for the stage renderers to build, query and mutate elements under node:test. */
export class FakeNode {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  listeners = new Map<string, Array<() => void>>();
  className = '';
  textContent = '';
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  src = '';
  alt = '';
  referrerPolicy = '';

  /**
   * @param tagName - Element name, or `#text` for a text node.
   */
  constructor(tagName: string) {
    this.tagName = tagName;
  }

  /**
   * @param name - Attribute name.
   * @param value - Attribute value.
   */
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  /**
   * @param name - Attribute name.
   * @returns The value, or null.
   */
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  /**
   * @param nodes - Children to append; strings become text nodes.
   */
  append(...nodes: Array<FakeNode | string>): void {
    for (const n of nodes) {
      const node = typeof n === 'string' ? Object.assign(new FakeNode('#text'), { textContent: n }) : n;
      node.parent = this;
      this.children.push(node);
    }
  }

  /**
   * @param nodes - New children.
   */
  replaceChildren(...nodes: FakeNode[]): void {
    this.children = [];
    this.append(...nodes);
  }

  /** Detach from the parent. */
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  /**
   * @param node - Replacement node.
   */
  replaceWith(node: FakeNode): void {
    const parent = this.parent;
    if (!parent) return;
    parent.children = parent.children.map((c) => (c === this ? node : c));
    node.parent = parent;
    this.parent = null;
  }

  /**
   * @param type - Event type.
   * @param fn - Listener.
   */
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  /**
   * @param type - Event type to fire.
   */
  fire(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }

  /**
   * @param predicate - Match test.
   * @returns Every descendant that matches, depth first.
   */
  findAll(predicate: (n: FakeNode) => boolean): FakeNode[] {
    return this.children.flatMap((c) => [...(predicate(c) ? [c] : []), ...c.findAll(predicate)]);
  }

  /** @returns Concatenated text of this subtree. */
  text(): string {
    return this.textContent + this.children.map((c) => c.text()).join('');
  }
}

export const fakeDocument = {
  createElement: (tag: string) => new FakeNode(tag),
  createElementNS: (_ns: string, tag: string) => new FakeNode(tag),
  createTextNode: (text: string) => Object.assign(new FakeNode('#text'), { textContent: text }),
};

/** Install the fake document as `globalThis.document`. */
export function installFakeDocument(): void {
  (globalThis as unknown as { document: typeof fakeDocument }).document = fakeDocument;
}

/**
 * Match elements by tag name.
 * @param tag - Tag name.
 * @returns Predicate for `findAll`.
 */
export const byTag = (tag: string) => (n: FakeNode) => n.tagName === tag;

/**
 * Match elements by class, whether set as an attribute or via `className`.
 * @param cls - Class name.
 * @returns Predicate for `findAll`.
 */
export const byClass = (cls: string) => (n: FakeNode) => (n.getAttribute('class') ?? n.className).split(/\s+/).includes(cls);
