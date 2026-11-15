// =============================================
// File: app/components/wiki/Breadcrumb.tsx
// (전체 코드)
// - selectedDocPath가 존재하면 브레드크럼 렌더
// - 클릭 시 해당 카테고리 대표 문서로 이동
// - 대표 문서 없으면 비활성화
// =============================================

import React from 'react';
import { toProxyUrl } from '@lib/cdn';

type CategoryNode = {
  id: number;
  name: string;
  icon?: string;
  document_id?: number;
  children?: CategoryNode[];
};

type CrumbItem = {
  id: number;
  name: string;
  icon?: string;
  document_id?: number;
  path: number[];
};

type Props = {
  selectedDocPath: number[] | null;
  categories: CategoryNode[];
  onNavigateCategoryDoc?: (path: number[], docId: number) => void;
};

function isImageUrl(v?: string) {
  return !!v && v.startsWith('http');
}

function buildCrumbs(categories: CategoryNode[], selectedDocPath: number[]) {
  const result: CrumbItem[] = [];
  let currentNodes = categories;
  let currentPath: number[] = [];

  for (const id of selectedDocPath) {
    const found = currentNodes.find((node) => node.id === id);
    if (!found) break;

    currentPath = [...currentPath, found.id];
    result.push({
      id: found.id,
      name: found.name,
      icon: found.icon,
      document_id: found.document_id,
      path: [...currentPath],
    });

    currentNodes = found.children ?? [];
  }

  return result;
}

export default function Breadcrumb({
  selectedDocPath,
  categories,
  onNavigateCategoryDoc,
}: Props) {
  if (!selectedDocPath || selectedDocPath.length === 0) return null;

  const crumbs = buildCrumbs(categories, selectedDocPath);
  if (crumbs.length === 0) return null;

  return (
    <nav className="wiki-breadcrumb" aria-label="breadcrumb">
      <div className="wiki-breadcrumb-list">
        {crumbs.map((item, idx) => {
          const hasDoc =
            Number.isFinite(Number(item.document_id)) &&
            Number(item.document_id) > 0;

          return (
            <React.Fragment key={item.id}>
              {idx > 0 && <span className="wiki-breadcrumb-sep">/</span>}

              <button
                type="button"
                className={`wiki-breadcrumb-item${hasDoc ? '' : ' is-disabled'}`}
                disabled={!hasDoc}
                aria-disabled={!hasDoc}
                title={hasDoc ? `${item.name} 대표 문서로 이동` : '대표 문서가 없습니다'}
                onClick={() => {
                  if (!hasDoc || !onNavigateCategoryDoc) return;
                  onNavigateCategoryDoc(item.path, Number(item.document_id));
                }}
              >
                {item.icon ? (
                  isImageUrl(item.icon) ? (
                    <img
                      src={toProxyUrl(item.icon)}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="wiki-breadcrumb-icon-img"
                    />
                  ) : (
                    <span className="wiki-breadcrumb-icon-emoji" aria-hidden="true">
                      {item.icon}
                    </span>
                  )
                ) : null}

                <span>{item.name}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <style jsx>{`
        .wiki-breadcrumb {
          margin: 0 0 10px;
        }

        .wiki-breadcrumb-list {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }

        .wiki-breadcrumb-sep {
          color: var(--rd-ink-3);
          font-size: 13px;
          line-height: 1;
          opacity: 0.7;
          user-select: none;
        }

        .wiki-breadcrumb-item {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: none;
          background: transparent;
          padding: 2px 4px;
          margin: 0 -4px;
          border-radius: 6px;
          color: var(--rd-ink-3);
          font-size: 13.5px;
          font-weight: 700;
          line-height: 1.4;
          cursor: pointer;
          transition: color 0.15s ease;
        }

        .wiki-breadcrumb-item:hover {
          color: var(--rd-brand-strong);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .wiki-breadcrumb-item.is-disabled,
        .wiki-breadcrumb-item:disabled {
          color: var(--rd-ink-3);
          cursor: default;
          pointer-events: none;
        }

        .wiki-breadcrumb-icon-img {
          width: 16px;
          height: 16px;
          object-fit: contain;
          border-radius: 4px;
        }

        .wiki-breadcrumb-icon-emoji {
          font-size: 14px;
          line-height: 1;
        }
      `}</style>
    </nav>
  );
}