'use client';

import React, { useState, useEffect } from 'react';
import { Laptop, Monitor } from 'lucide-react';

export const MobileNoticeModal: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileWidth = window.innerWidth < 1024;
      const isMobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsMobile(isMobileWidth || isMobileAgent);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) return null;

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-zinc-100/90 backdrop-blur-sm text-zinc-900 select-none overflow-hidden font-sans"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mobile-notice-title"
    >
      <div className="relative w-full max-w-sm bg-white border border-zinc-200/90 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-600 shadow-2xs mx-auto">
          <Monitor className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 id="mobile-notice-title" className="text-lg font-bold text-zinc-900 tracking-tight">
            Desktop Only
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Notehook is an AI-assisted dual-pane workspace designed exclusively for desktop monitors, side-by-side editing, and keyboard workflows.
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed pt-1">
            Mobile and small-screen devices are not supported. Please open Notehook on a laptop or desktop computer.
          </p>
        </div>

        <div className="pt-3 border-t border-zinc-100">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 border border-zinc-200/80 text-[11px] font-mono text-zinc-600">
            <Laptop className="w-3.5 h-3.5 text-zinc-500" />
            <span>Desktop browser required</span>
          </div>
        </div>
      </div>
    </div>
  );
};
