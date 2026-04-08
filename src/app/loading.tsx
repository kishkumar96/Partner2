/**
 * Loading UI for Suspense boundaries
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          {/* Outer ring */}
          <div className="w-20 h-20 border-4 border-slate-700 rounded-full"></div>

          {/* Spinning ring */}
          <div className="absolute inset-0 w-20 h-20 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>

          {/* Inner pulse */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          </div>
        </div>

        <p className="mt-6 text-slate-400 font-medium">Loading Resilience Atlas...</p>
        <p className="mt-2 text-sm text-slate-500">
          Please wait while we prepare the operational workspace
        </p>
      </div>
    </div>
  );
}
