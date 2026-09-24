'use client';

import React, { useState } from 'react';
import { usePlanet } from '@/lib/context';
import { Key, X, Check, Bot, ShieldCheck } from 'lucide-react';
import { AISettings } from '@/lib/types';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose }) => {
  const { aiSettings, setAiSettings } = usePlanet();
  const [provider, setProvider] = useState<AISettings['provider']>(aiSettings.provider);
  const [apiKey, setApiKey] = useState(aiSettings.apiKey);
  const [model, setModel] = useState(aiSettings.model);

  if (!isOpen) return null;

  const handleSave = () => {
    setAiSettings({
      provider,
      apiKey,
      model,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-indigo-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">BYOK AI Provider Settings</h3>
              <p className="text-xs text-zinc-500">Configure your LLM API keys for turn generation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {/* Provider Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-zinc-700">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider('simulated')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  provider === 'simulated'
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900'
                    : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                }`}
              >
                <Bot className="w-4 h-4 text-indigo-600" />
                <span>Simulated (Free)</span>
              </button>
              <button
                type="button"
                onClick={() => setProvider('openai')}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  provider === 'openai'
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900'
                    : 'border-zinc-200 hover:border-zinc-300 text-zinc-600'
                }`}
              >
                <Key className="w-4 h-4 text-indigo-600" />
                <span>OpenAI API</span>
              </button>
            </div>
          </div>

          {/* API Key */}
          {provider !== 'simulated' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-700">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
              />
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> Stored locally in your browser session
              </span>
            </div>
          )}

          {/* Model selection */}
          {provider !== 'simulated' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-700">Model Name</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 bg-zinc-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-200/60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
