'use client';
/* eslint-disable @next/next/no-img-element -- Preserve the existing direct-CDN image behavior. */

import React, { forwardRef } from 'react';
import { useResolvedImage } from '@/components/image/ImageReplacementProvider';

/** Resolves a historical managed URL without changing editor content or layout. */
const ManagedImage = forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement> & { resolveReplacements?: boolean }>(function ManagedImage({ src, alt = '', resolveReplacements = true, ...props }, ref) {
  const resolved = useResolvedImage(src);
  return <img {...props} ref={ref} src={resolveReplacements ? resolved : src} alt={alt} />;
});

export default ManagedImage;
