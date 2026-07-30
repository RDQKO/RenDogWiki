// =============================================
// File: app/components/wiki/NpcDetailModal.tsx
// 전체 교체 코드
// =============================================

'use client';

import React, {
  useEffect,
  useId,
} from 'react';

import {
  toProxyUrl,
} from '@lib/cdn';

import NpcPictureSlider from './NpcPictureSlider';

import '@/wiki/css/wiki-detail-modal.css';
import '@/wiki/css/document-components/quest-detail-modal.css';

type Reward = {
  icon?: string;
  text: string;
};

export type Npc = {
  id: number;
  name: string;
  icon: string;
  pictures?: string[];
  location_x: number;
  location_y: number;
  location_z: number;
  line?: string;
  quest?: string;
  rewards?: Reward[];
  requirement?: string;
  tag?: string | null;
};

type Props = {
  npc: Npc;
  onClose: () => void;

  /**
   * 퀘스트 상세면 quest,
   * 일반 NPC면 npc.
   */
  mode?: 'quest' | 'npc';
};

function isRemoteImage(
  value?: string | null,
) {
  return (
    typeof value === 'string' &&
    value.startsWith('http')
  );
}

export default function NpcDetailModal({
  npc,
  onClose,
  mode = 'quest',
}: Props) {
  const titleId =
    useId();

  const isQuest =
    mode === 'quest';

  useEffect(() => {
    document.body.classList.add(
      'rd-modal-open',
    );

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.body.classList.remove(
        'rd-modal-open',
      );

      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [onClose]);

  const rewards =
    Array.isArray(npc.rewards)
      ? npc.rewards
      : [];

  return (
    <div
      className={[
        'npc-modal-backdrop',
        'npc-detail-modal-backdrop',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={[
          'npc-modal-main',
          'npc-detail-modal',
        ].join(' ')}
        data-npc-modal-mode={mode}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <section
          className={[
            'npc-modal-left',
            'npc-detail-modal__media',
          ].join(' ')}
          aria-label="NPC 사진"
        >
          <div className="npc-modal-profile">
            <span
              className="npc-detail-modal__profile-icon"
              aria-hidden
            >
              {isRemoteImage(npc.icon) ? (
                <img
                  src={toProxyUrl(
                    npc.icon,
                  )}
                  alt=""
                  className="npc-modal-icon"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <span className="npc-modal-icon-emoji">
                  {npc.icon || ''}
                </span>
              )}
            </span>

            <span className="npc-detail-modal__profile-copy">
              <span className="npc-detail-modal__eyebrow">
                {isQuest
                  ? 'QUEST NPC'
                  : 'NPC PROFILE'}
              </span>

              <strong
                id={titleId}
                className="npc-modal-name"
              >
                {npc.name}
              </strong>
            </span>
          </div>

          <div className="npc-detail-modal__picture-frame">
            <NpcPictureSlider
              pictures={
                npc.pictures || []
              }
            />
          </div>
        </section>

        <section
          className={[
            'npc-modal-right',
            'npc-detail-modal__information',
          ].join(' ')}
          aria-label={
            isQuest
              ? '퀘스트 상세 정보'
              : 'NPC 상세 정보'
          }
        >
          <header className="npc-detail-modal__information-heading">
            <span
              className="npc-detail-modal__heading-icon"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                focusable="false"
              >
                <path
                  d="M7 4.5h10v15H7v-15Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.5 8h5M9.5 11.5h5M9.5 15h3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>

            <span>
              <strong>
                {isQuest
                  ? '퀘스트 정보'
                  : 'NPC 정보'}
              </strong>

              <small>
                {isQuest
                  ? '위치와 진행 조건을 확인하세요.'
                  : '위치와 대사를 확인하세요.'}
              </small>
            </span>
          </header>

          <div
            className="mgr-pill-row"
            data-detail-field="location"
          >
            <span className="mgr-pill-label">
              위치
            </span>

            <span className="mgr-pill-value">
              <span className="quest-detail-loc">
                (
                {' '}
                {npc.location_x},
                {' '}
                {npc.location_y},
                {' '}
                {npc.location_z}
                {' '}
                )
              </span>
            </span>
          </div>

          {isQuest ? (
            <>
              <div
                className={[
                  'mgr-pill-row',
                  'mgr-pill-row--quest',
                ].join(' ')}
                data-detail-field="quest"
              >
                <span className="mgr-pill-label">
                  퀘스트
                </span>

                <span className="mgr-pill-value">
                  {npc.quest?.trim() ? (
                    <span className="npc-detail-modal__pre-wrap">
                      {npc.quest}
                    </span>
                  ) : (
                    <span className="mgr-placeholder">
                      -
                    </span>
                  )}
                </span>
              </div>

              <div
                className="mgr-pill-row"
                data-detail-field="reward"
              >
                <span className="mgr-pill-label">
                  보상
                </span>

                <span
                  className={[
                    'mgr-pill-value',
                    'npc-detail-modal__reward-list',
                  ].join(' ')}
                >
                  {rewards.length > 0 ? (
                    rewards.map(
                      (
                        reward,
                        index,
                      ) => (
                        <span
                          key={`${reward.text}-${index}`}
                          className="mgr-chip"
                        >
                          {reward.icon ? (
                            isRemoteImage(
                              reward.icon,
                            ) ? (
                              <img
                                src={toProxyUrl(
                                  reward.icon,
                                )}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                              />
                            ) : (
                              <span className="mgr-chip-emoji">
                                {reward.icon}
                              </span>
                            )
                          ) : null}

                          <span>
                            {reward.text}
                          </span>
                        </span>
                      ),
                    )
                  ) : (
                    <span className="mgr-placeholder">
                      -
                    </span>
                  )}
                </span>
              </div>

              {npc.requirement?.trim() ? (
                <div
                  className="mgr-pill-row"
                  data-detail-field="requirement"
                >
                  <span className="mgr-pill-label">
                    선행조건
                  </span>

                  <span className="mgr-pill-value">
                    {npc.requirement}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}

          <div
            className={[
              'mgr-pill-row',
              'mgr-pill-row--multi',
            ].join(' ')}
            data-detail-field="dialogue"
          >
            <span className="mgr-pill-label">
              대사
            </span>

            <div className="mgr-pill-value">
              {npc.line?.trim() ? (
                <div className="npc-line-scroll">
                  {npc.line}
                </div>
              ) : (
                <span className="mgr-placeholder">
                  - 대사 없음 -
                </span>
              )}
            </div>
          </div>
        </section>

        <button
          type="button"
          className="npc-modal-close-btn"
          aria-label="퀘스트 상세 정보 닫기"
          onClick={onClose}
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            focusable="false"
          >
            <path
              d="m6 6 8 8M14 6l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
