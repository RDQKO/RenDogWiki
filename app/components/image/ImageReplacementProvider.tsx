'use client';

import React, { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cdn } from '@lib/cdn';
import { type ImageAliases, resolveImageReplacement } from '@lib/imageReplacements';

const Context = createContext<{ aliases: ImageAliases; refresh: (force?: boolean) => Promise<void> }>({ aliases: {}, refresh: async () => {} });

function NavigationRefresh({ refresh }: { refresh: () => Promise<void> }) {
  const pathname = usePathname();
  const query = useSearchParams()?.toString();
  useEffect(() => { void refresh(); }, [pathname, query, refresh]);
  return null;
}

export default function ImageReplacementProvider({ children, initialAliases = {} }: {
  children: React.ReactNode;
  initialAliases?: ImageAliases;
}) {
  const [aliases, setAliases] = useState(initialAliases);
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
  const value = useMemo(() => ({ aliases, refresh }), [aliases, refresh]);
  return <Context.Provider value={value}>
    <Suspense fallback={null}><NavigationRefresh refresh={refresh} /></Suspense>
    {children}
  </Context.Provider>;
}

export function useImageUrlResolver() {
  const { aliases } = useContext(Context);
  return useCallback((src: string | undefined) => {
    const resolved = resolveImageReplacement(src, aliases);
    return resolved && resolved !== src ? cdn(resolved) : resolved;
  }, [aliases]);
}

export function useResolvedImage(src: string | undefined) {
  return useImageUrlResolver()(src);
}

export function useRefreshImageReplacements() {
  return useContext(Context).refresh;
}
