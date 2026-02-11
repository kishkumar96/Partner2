"use client";

import { useEffect } from "react";
import { X, CheckCircle2, Info, AlertCircle } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "info" | "warning";
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose: () => void;
  duration?: number;
}

export default function Toast({ 
  message, 
  type = "info", 
  action, 
  onClose, 
  duration = 5000 
}: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle2,
    info: Info,
    warning: AlertCircle,
  };

  const colors = {
    success: "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-500/50 text-green-800 dark:text-green-300",
    info: "bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-500/50 text-blue-800 dark:text-blue-300",
    warning: "bg-amber-100 dark:bg-amber-900/30 border-amber-500 dark:border-amber-500/50 text-amber-800 dark:text-amber-300",
  };

  const Icon = icons[type];

  return (
    <div
      className={`fixed top-4 right-4 z-[65] flex items-center gap-3 px-4 py-3 rounded-lg border-2 shadow-lg backdrop-blur-sm animate-slide-up ${colors[type]} min-w-[280px] max-w-[90vw] md:max-w-md pointer-events-auto`}
      role="alert"
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1 text-sm font-medium">{message}</span>
      {action && (
        <button
          onClick={action.onClick}
          className="px-3 py-1 text-xs font-semibold rounded bg-white/20 hover:bg-white/30 dark:bg-black/20 dark:hover:bg-black/30 transition-colors whitespace-nowrap"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/20 dark:hover:bg-black/20 rounded transition-colors flex-shrink-0"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
