'use client';

import React from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { NotehookProvider } from '@/lib/context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotehookProvider>{children}</NotehookProvider>
    </AuthProvider>
  );
}
