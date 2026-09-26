'use client';

import React from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { NotehookProvider } from '@/lib/context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { PaneContainer } from './pane-container';
import { AIChatInput } from '../ai/ai-chat-input';
import { FloatingSelectionToolbar } from '../editor/floating-selection-toolbar';
import { CommandPaletteModal } from '../modals/command-palette-modal';

export const AppShell: React.FC = () => {
  React.useEffect(() => {
    let activePill: HTMLElement | null = null;
    let unifiedBox: { top: number; bottom: number; left: number; right: number } | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.('.page-mention-pill') as HTMLElement | null;
      if (!target) return;
      if (target.classList.contains('deleted-mention-pill') || target.getAttribute('data-deleted') === 'true') return;
      if (document.body.classList.contains('is-selecting-text')) return;

      // If already hover-locked on this pill, do NOT reset unifiedBox
      if (activePill === target && target.classList.contains('is-hover-locked')) {
        return;
      }

      if (activePill && activePill !== target) {
        activePill.classList.remove('is-hover-locked');
      }

      activePill = target;
      const originRect = target.getBoundingClientRect();
      activePill.classList.add('is-hover-locked');

      // Set synchronous initial box so mousemove never sees null
      unifiedBox = {
        top: originRect.top,
        bottom: originRect.bottom,
        left: originRect.left,
        right: originRect.right,
      };

      // Compute expanded unified bounding box (original area + line 2 area) after layout reflow
      requestAnimationFrame(() => {
        if (!activePill || activePill !== target) return;
        const expandedRect = activePill.getBoundingClientRect();
        unifiedBox = {
          top: Math.min(originRect.top, expandedRect.top),
          bottom: Math.max(originRect.bottom, expandedRect.bottom),
          left: Math.min(originRect.left, expandedRect.left),
          right: Math.max(originRect.right, expandedRect.right),
        };
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!activePill || !unifiedBox) return;

      const x = e.clientX;
      const y = e.clientY;
      const pad = 12; // Generous 12px comfort padding around combined bounds

      const isInsideUnified =
        x >= unifiedBox.left - pad &&
        x <= unifiedBox.right + pad &&
        y >= unifiedBox.top - pad &&
        y <= unifiedBox.bottom + pad;

      if (!isInsideUnified) {
        activePill.classList.remove('is-hover-locked');
        activePill = null;
        unifiedBox = null;
      }
    };

    window.addEventListener('mouseover', handleMouseOver, true);
    window.addEventListener('mousemove', handleMouseMove, true);

    return () => {
      window.removeEventListener('mouseover', handleMouseOver, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      if (activePill) {
        activePill.classList.remove('is-hover-locked');
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-zinc-900 font-sans antialiased">
      <Header />
      <div className="flex-1 flex min-w-0 h-full overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <PaneContainer />
          <AIChatInput />
        </div>
      </div>
      <FloatingSelectionToolbar />
      <CommandPaletteModal />
    </div>
  );
};
