"use client";

import { Play, Pause } from "lucide-react";

interface CycloneAnimationToggleProps {
  isVisible: boolean;
  isPlaying: boolean;
  onToggle: () => void;
}

export function CycloneAnimationToggle({
  isVisible,
  isPlaying,
  onToggle,
}: CycloneAnimationToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`absolute bottom-32 right-4 z-[100] p-3 rounded-full transition-all duration-300 shadow-lg ${
        isVisible
          ? 'bg-blue-600 hover:bg-blue-500'
          : 'bg-gray-700/90 hover:bg-gray-600'
      }`}
      title={isVisible ? 'Hide cyclone animation' : 'Show cyclone animation'}
      style={{
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center justify-center">
        {isVisible ? (
          <div className="relative">
            <span className="text-2xl">🌀</span>
            {isPlaying && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            )}
          </div>
        ) : (
          <span className="text-2xl opacity-50">🌀</span>
        )}
      </div>
    </button>
  );
}
