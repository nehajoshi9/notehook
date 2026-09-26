'use client';

import React from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { NotehookProvider } from '@/lib/context';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export default function DashboardPage() {
  return <DashboardView />;
}
