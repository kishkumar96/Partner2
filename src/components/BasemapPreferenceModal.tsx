'use client';

/**
 * BasemapPreferenceModal - First-visit basemap selection
 *
 * Shows on first visit to help users choose their preferred basemap.
 * Selection is saved to localStorage and never shown again unless reset.
 */

import { useEffect, useRef, useState } from 'react';
import { Globe2, Map, Satellite, Check } from 'lucide-react';
import { saveBasemapPreference } from '@/utils/userPreferences';
import { BASEMAP_STYLES } from '@/utils/basemaps';

const BASEMAP_OPTIONS = [
  {
    id: 'positron',
    name: 'Light',
    description: 'Clean & bright - ideal for printing',
    icon: Globe2,
    style: BASEMAP_STYLES.positron,
    preview: 'bg-gradient-to-br from-slate-100 to-slate-200',
  },
  {
    id: 'voyager',
    name: 'Detailed',
    description: 'Balanced detail - roads and labels without a dark theme',
    icon: Map,
    style: BASEMAP_STYLES.voyager,
    preview: 'bg-gradient-to-br from-stone-200 to-slate-300',
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Low-light mode - easier on eyes',
    icon: Satellite,
    style: BASEMAP_STYLES.dark,
    preview: 'bg-gradient-to-br from-slate-800 to-slate-900',
  },
] as const;

interface BasemapPreferenceModalProps {
  onSelect: (basemapStyle: string) => void;
  onSkip: () => void;
}

export default function BasemapPreferenceModal({ onSelect, onSkip }: BasemapPreferenceModalProps) {
  const [selectedId, setSelectedId] = useState<string>('positron');
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  // This modal is mounted/unmounted by its parent rather than toggled via
  // an `open` prop, so focus-in happens once on mount and focus-out (via
  // browser default, since the trigger that caused it to mount wasn't a
  // click) is left alone -- same reasoning CountryComparisonModal uses,
  // adapted for how this component is actually wired.
  useEffect(() => {
    firstOptionRef.current?.focus();
  }, []);

  const getFocusableElements = () => {
    if (!dialogRef.current) return [];
    return Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  };

  const handleContinue = () => {
    const selected = BASEMAP_OPTIONS.find(opt => opt.id === selectedId);
    if (selected) {
      onSelect(selected.style);
    }

    // Save preference to localStorage if checkbox is checked
    if (dontShowAgain) {
      saveBasemapPreference(selected?.style || '');
    }
  };

  const handleSkip = () => {
    // Use default but only suppress future prompts when explicitly requested.
    if (dontShowAgain) {
      localStorage.setItem('basemap-preference-set', 'true');
    }
    onSkip();
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleSkip();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      onKeyDown={handleDialogKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="basemap-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/98 to-slate-950/98 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Globe2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 id="basemap-modal-title" className="text-xl font-bold text-slate-100">
                Welcome to the Climate Risk Dashboard
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">Choose your preferred basemap style</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <p className="text-sm text-slate-300 mb-4">
            Select a basemap that works best for your environment and workflow. You can change this
            later in Map Controls.
          </p>

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {BASEMAP_OPTIONS.map((option, index) => {
              const Icon = option.icon;
              const isSelected = selectedId === option.id;
              const isRecommended = option.id === 'positron';

              return (
                <button
                  key={option.id}
                  ref={index === 0 ? firstOptionRef : undefined}
                  type="button"
                  onClick={() => setSelectedId(option.id)}
                  className={`group relative rounded-xl p-4 text-left transition-all ${
                    isSelected
                      ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-2 border-blue-500/50 shadow-lg ring-2 ring-blue-400/30'
                      : 'bg-slate-800/40 border-2 border-slate-700/60 hover:border-slate-600/80 hover:bg-slate-800/60'
                  }`}
                >
                  {/* Preview bar */}
                  <div className={`h-2 w-full rounded-md mb-3 ${option.preview}`} />

                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-blue-500/20 border border-blue-400/50'
                          : 'bg-slate-700/50 border border-slate-600/50 group-hover:bg-slate-700/70'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isSelected ? 'text-blue-300' : 'text-slate-400 group-hover:text-slate-300'
                        }`}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3
                          className={`text-sm font-semibold ${
                            isSelected
                              ? 'text-blue-100'
                              : 'text-slate-200 group-hover:text-slate-100'
                          }`}
                        >
                          {option.name}
                        </h3>
                        {isRecommended && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 group-hover:text-slate-300">
                        {option.description}
                      </p>
                    </div>

                    {/* Check indicator */}
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Don't show again checkbox */}
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 cursor-pointer hover:bg-slate-800/60 transition-colors">
            <div className="relative flex items-center justify-center">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={e => setDontShowAgain(e.target.checked)}
                className="appearance-none w-5 h-5 border-2 border-slate-500/80 rounded cursor-pointer transition-colors hover:border-blue-400 checked:border-blue-400 checked:bg-blue-500/20"
              />
              {dontShowAgain && (
                <Check
                  className="absolute w-4 h-4 text-blue-400 pointer-events-none"
                  strokeWidth={3}
                />
              )}
            </div>
            <span className="text-sm text-slate-300 select-none">
              Don't ask me again (you can change this anytime in Map Controls)
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-900/50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            Skip - use Light basemap
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg shadow-lg shadow-blue-500/20 transition-all"
          >
            Continue with {BASEMAP_OPTIONS.find(opt => opt.id === selectedId)?.name}
          </button>
        </div>
      </div>
    </div>
  );
}
