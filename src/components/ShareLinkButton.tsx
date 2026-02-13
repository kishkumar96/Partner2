/**
 * Share Link Button
 * 
 * Copies current map view URL to clipboard for sharing.
 * Provides visual feedback on successful copy.
 */

'use client';

import { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { MapURLState, buildShareableUrl, copyShareableUrl } from '@/utils/urlState';

interface ShareLinkButtonProps {
  /** Current map state to share */
  mapState: MapURLState;
  /** Optional className for styling */
  className?: string;
  /** Show icon only (compact mode) */
  compact?: boolean;
}

export default function ShareLinkButton({ 
  mapState, 
  className = '',
  compact = false,
}: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleShare = async () => {
    const success = await copyShareableUrl(mapState);
    
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
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Share2 className="w-4 h-4" />
        )}
        {!compact && (
          <span className="text-sm font-medium">
            {copied ? 'Copied!' : 'Share Link'}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && !copied && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none z-50 border border-slate-700">
          Copy link to current view
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}
