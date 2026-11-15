import { Editor, Element, Node, Path, Range, Transforms, type Descendant } from 'slate';
import { HistoryEditor } from 'slate-history';
import type { CollapsibleElement } from '@/types/slate';

export type CollapsibleOptions = { title: string; defaultOpen: boolean };
export const DEFAULT_COLLAPSIBLE: CollapsibleOptions = { title: '펼침·접힘', defaultOpen: true };
const paragraph = (): Descendant => ({ type: 'paragraph', children: [{ text: '' }] });

export function withCollapsible(editor: Editor): Editor {
  const { normalizeNode } = editor;
  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (Element.isElement(node) && node.type === 'collapsible' && !node.children.length) {
      Transforms.insertNodes(editor, paragraph(), { at: [...path, 0] });
      return;
    }
    normalizeNode(entry);
  };
  return editor;
}

export function wrapInCollapsible(editor: Editor, selection: Range | null, options: CollapsibleOptions = DEFAULT_COLLAPSIBLE) {
  const wrapper: CollapsibleElement = { type: 'collapsible', title: options.title.trim() || DEFAULT_COLLAPSIBLE.title, defaultOpen: options.defaultOpen, children: [] };
  const change = () => Editor.withoutNormalizing(editor, () => {
    if (!selection) {
      const path = [editor.children.length];
      Transforms.insertNodes(editor, { ...wrapper, children: [paragraph() as CollapsibleElement['children'][number]] }, { at: path });
      Transforms.select(editor, Editor.start(editor, path));
      return;
    }
    let range = Editor.unhangRange(editor, selection);
    if (!Node.has(editor, range.anchor.path) || !Node.has(editor, range.focus.path)) return;
    const [start, end] = Range.edges(range);
    let parent = Path.common(start.path, end.path);
    // Wrap sibling blocks in the nearest block container, never table rows/cells themselves.
    while (parent.length) {
      const node = Node.get(editor, parent);
      if (Element.isElement(node) && (node.type === 'collapsible' || node.type === 'table-cell')) break;
      parent = Path.parent(parent);
    }
    const depth = parent.length + 1;
    const startPath = start.path.slice(0, depth);
    const endPath = end.path.slice(0, depth);
    if (Range.isCollapsed(range)) {
      range = Editor.range(editor, startPath);
    } else {
      // Complex blocks are indivisible: selecting inside a table/card keeps its full structure.
      const first = Node.get(editor, startPath);
      const last = Node.get(editor, endPath);
      const complex = (node: Node) => Element.isElement(node) && Editor.hasBlocks(editor, node);
      range = {
        anchor: complex(first) || (Element.isElement(first) && editor.isVoid(first)) ? Editor.start(editor, startPath) : start,
        focus: complex(last) || (Element.isElement(last) && editor.isVoid(last)) ? Editor.end(editor, endPath) : end,
      };
    }
    Transforms.select(editor, range);
    Transforms.wrapNodes(editor, wrapper, {
      at: range, split: true, mode: 'highest',
      match: (node, path) => Element.isElement(node) && Editor.isBlock(editor, node) && path.length === depth,
    });
  });
  if (HistoryEditor.isHistoryEditor(editor)) HistoryEditor.withNewBatch(editor, change);
  else change();
}

export function unwrapCollapsible(editor: Editor, path: Path) {
  Transforms.unwrapNodes(editor, { at: path, match: node => Element.isElement(node) && node.type === 'collapsible' });
}
