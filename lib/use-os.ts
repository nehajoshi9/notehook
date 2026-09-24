'use client';

import { useState, useEffect } from 'react';

export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const userAgent = navigator.userAgent || '';
      const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
      setIsMac(/Mac|iPod|iPhone|iPad/.test(platform) || /Macintosh|Mac OS/.test(userAgent));
    }
  }, []);

  return isMac;
}
