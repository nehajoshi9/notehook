'use client';

import React, { useState, useEffect } from 'react';
import { Laptop, X } from 'lucide-react';

export const MobileNoticeModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('notehook_mobile_notice_dismissed');
    if (isDismissed) return;

    const checkMobile = () => {
      const isMobileWidth = window.innerWidth < 768;
      const isMobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      if (isMobileWidth || isMobileAgent) {
        setIsOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDismiss = () => {
    setIsOpen(false);
    sessionStorage.setItem('notehook_mobile_notice_dismissed', 'true');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-sm bg-white rounded-2xl border border-zinc-200 shadow-2xl p-6 text-center space-y-4 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-notice-title"
      >
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-800 shadow-2xs mx-auto">
          <Laptop className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h3 id="mobile-notice-title" className="text-base font-semibold text-zinc-900 tracking-tight">
            Desktop Web App
          </h3>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Notehook is a dual-pane workspace designed for desktop screens, keyboard shortcuts, and side-by-side editing.
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed pt-1">
            For the optimal experience, please open Notehook on your laptop or desktop browser.
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleDismiss}
            className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] text-white text-xs font-medium rounded-xl shadow-xs transition-all cursor-pointer"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};
