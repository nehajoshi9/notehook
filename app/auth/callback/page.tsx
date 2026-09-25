'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      if (!supabase) {
        router.replace('/');
        return;
      }

      try {
        // If code param exists in URL, Supabase will exchange it or getSession will handle it
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setError(error.message);
          return;
        }

        // Successfully authenticated
        router.replace('/');
      } catch (err: any) {
        console.error('Auth callback error:', err);
        setError(err?.message || 'Authentication failed');
      }
    };

    handleAuthCallback();
  }, [router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 p-4 text-center">
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm max-w-md w-full space-y-3">
          <h2 className="text-base font-semibold text-red-600">Authentication Error</h2>
          <p className="text-xs text-zinc-600">{error}</p>
          <button
            onClick={() => router.replace('/')}
            className="mt-3 px-4 py-2 bg-zinc-900 text-white rounded-lg text-xs font-medium hover:bg-zinc-800 transition-colors"
          >
            Return to App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
      <p className="text-xs font-medium text-zinc-500">Completing sign-in...</p>
    </div>
  );
}
