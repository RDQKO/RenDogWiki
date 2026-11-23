'use client';

import React, { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cdn } from '@lib/cdn';
import { type ImageAliases, type ImageVariantMap, type ImageStyle, IMAGE_STYLE_SWITCHING_ENABLED, isImageStyle, resolveImageVariant } from '@lib/imageReplacements';
import { readLocalStorage, writeLocalStorage } from '@lib/browserStorage';

export const IMAGE_STYLE_STORAGE_KEY = 'rdwiki-image-style';
const Context = createContext<{ aliases: ImageAliases; variants: ImageVariantMap; style: ImageStyle; setStyle: (style: ImageStyle) => void; refresh: (force?: boolean) => Promise<void> }>({ aliases: {}, variants: {}, style: '2d', setStyle: () => {}, refresh: async () => {} });

function NavigationRefresh({ refresh }: { refresh: () => Promise<void> }) {
  const pathname = usePathname();
  const query = useSearchParams()?.toString();
  useEffect(() => { void refresh(); }, [pathname, query, refresh]);
  return null;
}

export default function ImageReplacementProvider({ children, initialAliases = {}, initialVariants = {} }: {
  children: React.ReactNode;
  initialAliases?: ImageAliases;
  initialVariants?: ImageVariantMap;
}) {
  const [aliases, setAliases] = useState(initialAliases);
  const [variants, setVariants] = useState(initialVariants);
  const [style, updateStyle] = useState<ImageStyle>('2d');
  const setStyle = useCallback((next: ImageStyle) => {
    if (!IMAGE_STYLE_SWITCHING_ENABLED || !isImageStyle(next)) return;
    updateStyle(next);
    writeLocalStorage(IMAGE_STYLE_STORAGE_KEY, next);
  }, []);
  useEffect(() => {
    if (!IMAGE_STYLE_SWITCHING_ENABLED) return;
    const saved = readLocalStorage(IMAGE_STYLE_STORAGE_KEY);
    if (isImageStyle(saved)) updateStyle(saved);
    const onStorage = (event: StorageEvent) => {
      if (event.key === IMAGE_STYLE_STORAGE_KEY) updateStyle(isImageStyle(event.newValue) ? event.newValue : '2d');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const pending = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async (force = false) => {
    if (pending.current) {
      await pending.current;
      if (!force) return;
    }
    const request = (async () => {
      try {
        const response = await fetch('/api/image/replacements', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data.aliases && typeof data.aliases === 'object' && !Array.isArray(data.aliases)) {
          setAliases(previous => Object.keys(previous).length === Object.keys(data.aliases).length &&
            Object.entries(previous).every(([key, value]) => data.aliases[key] === value) ? previous : data.aliases);
        }
        if (data.variants && typeof data.variants === 'object' && !Array.isArray(data.variants)) {
          setVariants(previous => JSON.stringify(previous) === JSON.stringify(data.variants) ? previous : data.variants);
        }
      } catch {
        // A transient registry error must not remove the last known aliases.
      }
    })();
    pending.current = request;
    void request.finally(() => { if (pending.current === request) pending.current = null; });
    return request;
  }, []);
  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener('focus', reload);
    window.addEventListener('pageshow', reload);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('pageshow', reload); };
  }, [refresh]);
  const value = useMemo(() => ({ aliases, variants, style, setStyle, refresh }), [aliases, variants, style, setStyle, refresh]);
  return <Context.Provider value={value}>
    <Suspense fallback={null}><NavigationRefresh refresh={refresh} /></Suspense>
    {children}
  </Context.Provider>;
}

export function useImageUrlResolver() {
  const { aliases, variants, style } = useContext(Context);
  return useCallback((src: string | undefined) => {
    const resolved = resolveImageVariant(src, { aliases, variants }, style);
    return resolved && resolved !== src ? cdn(resolved) : resolved;
  }, [aliases, variants, style]);
}

export function useResolvedImage(src: string | undefined) {
  return useImageUrlResolver()(src);
}

export function useRefreshImageReplacements() {
  return useContext(Context).refresh;
}

export function useImageStyle() {
  const { style, setStyle } = useContext(Context);
  return { style, setStyle };
}
