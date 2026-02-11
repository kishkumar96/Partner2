"use client";

interface CycloneAnimationToggleProps {
  isVisible: boolean;
  isPlaying: boolean;
  onToggleVisibility: () => void;
}

export default function CycloneAnimationToggle({
  isVisible,
  isPlaying,
  onToggleVisibility,
}: CycloneAnimationToggleProps) {
  const toggleLabel = isVisible ? "Hide cyclone animation" : "Show cyclone animation";
  return (
    <button
      type="button"
      onClick={onToggleVisibility}
      className={`absolute bottom-32 right-4 z-[100] p-3 rounded-full transition-all duration-300 shadow-lg backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
        isVisible
          ? 'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-400'
          : 'bg-slate-700/90 hover:bg-slate-600/70 focus-visible:ring-slate-400'
      }`}
      title={toggleLabel}
      aria-label={toggleLabel}
      aria-pressed={isVisible}
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
