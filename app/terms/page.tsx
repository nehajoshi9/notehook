import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { NotehookLogo } from '@/components/icons/notehook-logo';

export default function TermsPage() {
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
          <FileText className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Legal Terms</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950 mb-2 font-heading">Terms of Service</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: September 26, 2026</p>

        <div className="space-y-6 text-sm text-zinc-700 leading-relaxed bg-white p-6 md:p-8 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Notehook, you agree to be bound by these Terms of Service. Notehook provides a dual-pane workspace and AI context navigation layer for your projects.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">2. User Conduct & Acceptable Use</h2>
            <p>
              You are responsible for the content you generate, link, or store within Notehook. You agree not to use the service for unlawful purposes or to upload sensitive personal data prohibited under third-party AI provider terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">3. Third-Party AI Services</h2>
            <p>
              Notehook integrates with AI API providers (such as Google Gemini). AI-generated output is provided on an &quot;as-is&quot; basis. You are encouraged to review AI-generated entity specifications and decisions before committing them as canonical.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">4. Intellectual Property & Notes Ownership</h2>
            <p>
              You retain full ownership of all notes, entity specifications, trade-offs, tasks, and content created in your workspaces. Notehook does not claim ownership over your human-curated notes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-zinc-900 font-heading">5. Disclaimer of Warranties & Limitation of Liability</h2>
            <p>
              Notehook is provided &quot;as is&quot; without warranties of any kind. We are not liable for any data loss, service interruptions, or reliance placed on automated AI extractions.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
