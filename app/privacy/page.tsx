import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, FileText } from 'lucide-react';
import { NotehookLogo } from '@/components/icons/notehook-logo';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col antialiased font-sans">
      {/* Header */}
      <header className="h-14 px-5 bg-white border-b border-zinc-200 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Link href="/dashboard" className="flex items-center gap-2 group cursor-pointer hover:opacity-85 transition-opacity">
            <NotehookLogo className="w-7.5 h-7.5 text-purple-600 group-hover:text-purple-700 transition-colors" />
            <span className="text-sm font-bold tracking-tight text-zinc-950 font-heading">Notehook</span>
          </Link>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-950 transition-all shadow-2xs"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
          <span>Back to Dashboard</span>
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-2 text-purple-600">
          <Shield className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Legal & Transparency</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950 mb-2 font-heading">Privacy Policy</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: September 26, 2026</p>

        <div className="space-y-6 text-sm text-zinc-700 leading-relaxed bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">1. Overview & Data Philosophy</h2>
            <p>
              Notehook is built with privacy and data isolation in mind. Your workspaces, entity specifications, sacred notes, decisions, and tasks are stored locally on your device or linked securely to your authentication profile.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">2. Google Gemini AI API Disclaimer</h2>
            <p>
              Notehook utilizes Google's Gemini API free tier for conversational AI turns and automatic extraction. Data sent to the free-tier API may be processed by Google in accordance with Google's API Terms of Service for model service quality. Please do not submit confidential information, passwords, financial details, or sensitive personal data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">3. Information We Store</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Authentication Data:</strong> If you sign in via Google OAuth, we receive basic profile info (email, display name, avatar URL).</li>
              <li><strong>Workspace & Page Storage:</strong> Workspace data, entity version histories, and notes are saved in your browser&apos;s local storage and/or isolated Supabase tables with Row-Level Security (RLS).</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">4. Notes Protection</h2>
            <p>
              Pages designated as <strong>Notes</strong> are strictly isolated from automated AI modifications. The AI engine is prohibited from overwriting or mutating your personal scratchpads. The AI also won't read these notes unless you reference them in a conversation.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">5. Contact & Inquiries</h2>
            <p>
              If you have questions regarding data privacy or wish to clear your local data, you can do so anytime via browser settings or the clearing utilities provided in Notehook.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
