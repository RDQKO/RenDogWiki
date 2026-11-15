import type { Descendant } from 'slate';

// Search sections follow headings inside collapsible regions in document order.
export function* flattenCollapsibleBlocks(nodes: Descendant[]): Generator<Descendant> {
  for (const node of nodes) {
    if ('type' in node && node.type === 'collapsible') {
      yield { type: 'paragraph', children: [{ text: String(node.title || '펼침·접힘') }] };
      yield* flattenCollapsibleBlocks(node.children);
    } else {
      yield node;
    }
  }
}

export function revealCollapsedAncestors(target: HTMLElement) {
  let parent = target.parentElement;
  while (parent) {
    if (parent.tagName === 'DETAILS') (parent as HTMLDetailsElement).open = true;
    parent = parent.parentElement;
  }
}
