import React from 'react';
import CollapsibleBlock from '@/components/wiki-render/collapsible/CollapsibleBlock';
import { Text } from 'slate';

import {
  LeafRenderer,
} from '@/components/wiki-render';

import {
  DividerReadAdapter,
  InfoBoxReadAdapter,
  ParagraphReadAdapter,
} from './BasicBlockReadAdapters';
import FootnoteReadAdapter from './FootnoteReadAdapter';
import HeadingReadAdapter from './HeadingReadAdapter';
import {
  InlineImageReadAdapter,
  InlineMarkReadAdapter,
  WikiRefReadAdapter,
} from './InlineReadAdapters';
import InlineLinkReadAdapter from './InlineLinkReadAdapter';
import {
  LinkBlockReadAdapter,
  LinkBlockRowReadAdapter,
} from './LinkBlockReadAdapter';
import {
  ImageReadAdapter,
  VideoReadAdapter,
} from './MediaReadAdapter';
import PriceTableReadAdapter from './PriceTableReadAdapter';
import {
  TableCellReadAdapter,
  TableReadAdapter,
  TableRowReadAdapter,
} from './TableReadAdapter';
import type {
  HeadingCopyCtx,
  ReadRenderEnv,
  WikiRefHandlers,
} from './types';
import WeaponCardReadAdapter from './weapon/WeaponCardReadAdapter';

function renderReadLeaf(
  node: any,
  key?: React.Key,
  env?: ReadRenderEnv,
) {
  return (
    <LeafRenderer
      key={key}
      mode="read"
      leaf={node}
      env={env}
    >
      {String(node?.text ?? '')}
    </LeafRenderer>
  );
}

export function renderReadNode(
  node: any,
  key?: React.Key,
  ctx?: HeadingCopyCtx,
  handlers?: WikiRefHandlers,
  env?: ReadRenderEnv,
): React.ReactNode {
  if (Text.isText(node)) {
    return renderReadLeaf(node, key, env);
  }

  const children = node.children?.map(
    (child: any, index: number) =>
      renderReadNode(
        child,
        key ? `${key}-${index}` : index,
        ctx,
        handlers,
        env,
      ),
  );

  switch (node.type) {
    case 'collapsible':
      return <CollapsibleBlock title={node.title} defaultOpen={node.defaultOpen !== false}>{children}</CollapsibleBlock>;
    case 'paragraph': {
      return (
        <ParagraphReadAdapter
          node={node}
          env={env}
        >
          {children}
        </ParagraphReadAdapter>
      );
    }

    case 'heading-one':
    case 'heading-two':
    case 'heading-three': {
      return (
        <HeadingReadAdapter
          node={node}
          keyProp={key}
          ctx={ctx}
          handlers={handlers}
          env={env}
          renderNode={renderReadNode}
        />
      );
    }

    case 'link': {
      return (
        <InlineLinkReadAdapter
          node={node}
          onWikiNavigate={env?.onWikiNavigate}
        >
          {children}
        </InlineLinkReadAdapter>
      );
    }

    case 'divider': {
      return <DividerReadAdapter node={node} />;
    }

    case 'link-block': {
      return (
        <LinkBlockReadAdapter
          node={node}
          env={env}
        >
          {children}
        </LinkBlockReadAdapter>
      );
    }

    case 'link-block-row': {
      return (
        <LinkBlockRowReadAdapter
          node={node}
          keyProp={key}
          ctx={ctx}
          handlers={handlers}
          env={env}
          renderNode={renderReadNode}
        />
      );
    }

    case 'info-box': {
      return (
        <InfoBoxReadAdapter
          node={node}
          keyProp={key}
          ctx={ctx}
          handlers={handlers}
          env={env}
          renderNode={renderReadNode}
        />
      );
    }

    case 'image': {
      return <ImageReadAdapter node={node} />;
    }

    case 'video': {
      return <VideoReadAdapter node={node} />;
    }

    case 'inline-image': {
      return <InlineImageReadAdapter node={node} />;
    }

    case 'inline-mark': {
      return (
        <InlineMarkReadAdapter node={node}>
          {children}
        </InlineMarkReadAdapter>
      );
    }

    case 'footnote': {
      return (
        <FootnoteReadAdapter
          node={node}
        />
      );
    }

    case 'price-table-card': {
      return <PriceTableReadAdapter node={node} />;
    }

    case 'weapon-card': {
      return (
        <WeaponCardReadAdapter
          key={key}
          keyProp={key}
          node={node}
          isDarkMode={env?.isDarkMode}
          isMobile={env?.isMobile}
        />
      );
    }

    case 'table': {
      return (
        <TableReadAdapter node={node}>
          {children}
        </TableReadAdapter>
      );
    }

    case 'table-row': {
      return (
        <TableRowReadAdapter>
          {children}
        </TableRowReadAdapter>
      );
    }

    case 'table-cell': {
      return (
        <TableCellReadAdapter
          node={node}
          keyProp={key}
          ctx={ctx}
          handlers={handlers}
          env={env}
          renderNode={renderReadNode}
        />
      );
    }

    case 'wiki-ref': {
      return (
        <WikiRefReadAdapter
          node={node}
          handlers={handlers}
        >
          {children}
        </WikiRefReadAdapter>
      );
    }

    default: {
      return <div key={key}>{children}</div>;
    }
  }
}