'use client';

import React from 'react';
import { Compass, Search } from 'lucide-react';
import { openCommandPalette } from '@/components/modals/command-palette-modal';
import { useIsMac } from '@/lib/use-os';

export const Header: React.FC = () => {
  const isMac = useIsMac();

  return (
    <header className="h-14 px-5 bg-white border-b border-zinc-200 flex items-center justify-between z-30 text-zinc-900 shrink-0 select-none relative">
      {/* Brand Logo */}
      <div className="flex items-center gap-2">
        <div className="p-1 rounded-md bg-zinc-900 text-white shadow-2xs">
          <Compass className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold tracking-tight text-zinc-950 font-heading">
          Notehook
        </span>
      </div>

      {/* Center "Jump to..." Command Palette Button */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <button
          type="button"
          onClick={openCommandPalette}
          className="relative flex items-center rounded-full bg-zinc-100/90 hover:bg-white border border-zinc-200/90 hover:border-zinc-300 px-3 py-1 text-xs text-zinc-900 transition-all shadow-2xs group cursor-pointer"
        >
          <Search className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0 mr-1.5 pointer-events-none" />
          <span className="text-zinc-500 group-hover:text-zinc-800 transition-colors mr-2">Jump to...</span>
          <span className="text-[10px] font-mono text-zinc-400 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 ml-1">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </span>
        </button>
      </div>

      {/* Right flex placeholder for balance */}
      <div className="w-24" />
    </header>
  );
};
