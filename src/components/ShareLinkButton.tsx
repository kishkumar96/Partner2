/**
 * Share Link Button
 *
 * Copies current map view URL to clipboard for sharing.
 * Provides visual feedback on successful copy.
 */

'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { MapURLState, copyShareableUrl } from '@/utils/urlState';

interface ShareLinkButtonProps {
  mapState: MapURLState;
  path: string;
  className?: string;
  compact?: boolean;
}

export default function ShareLinkButton({
  mapState,
  path,
  className = '',
  compact = false,
}: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleShare = async () => {
    const success = await copyShareableUrl(mapState, path);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-slate-700/50 hover:bg-slate-700 
          border border-slate-600/50 hover:border-slate-500
          text-slate-200 hover:text-white
          transition-all duration-200
          ${copied ? 'bg-green-600/20 border-green-500/50' : ''}
          ${className}
        `}
        aria-label="Copy link to current view"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
        {!compact && <span className="text-sm font-medium">{copied ? 'Copied!' : 'Share'}</span>}
      </button>

      {showTooltip && !copied && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded whitespace-nowrap">
          Copy shareable link
        </div>
      )}
    </div>
  );
}
