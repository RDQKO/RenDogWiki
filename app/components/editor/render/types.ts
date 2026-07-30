import type { RenderElementProps } from 'slate-react';
import type { Path } from 'slate';

import type {
  CustomElement,
  FootnoteElement,
} from '@/types/slate';
import type {
  WikiRefKind as SharedWikiRefKind,
} from '@/components/wiki-render/types';

export type {
  WikiRefKind,
} from '@/components/wiki-render/types';

/**
 * 공통 Renderer Props
 * - Slate가 요구하는 RenderElementProps 기반
 * - 추가 props는 모두 optional 로 만들어 충돌 제거
 */
export type CustomElementProps = {
  editor: any;
  onIconClick: (element: CustomElement) => void;

  openFootnoteEditor?: (
    path: Path,
    element: FootnoteElement,
  ) => void;

  readOnly?: boolean;

  onWikiRefClick?: (
    kind: SharedWikiRefKind,
    id: number,
  ) => void | Promise<void>;

  onOpenWikiRef?: (
    kind: SharedWikiRefKind,
    id: number,
  ) => void | Promise<void>;
};

export type ElementRenderProps =
  RenderElementProps & CustomElementProps;
