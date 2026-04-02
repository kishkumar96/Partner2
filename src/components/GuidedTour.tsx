'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';

export interface GuidedTourStep {
  title: string;
  body: string;
  selector?: string;
  category?: string;
  targetLabel?: string;
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface GuidedTourProps {
  open: boolean;
  steps: GuidedTourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onStepSelect?: (stepIndex: number) => void;
  onClose: () => void;
  onFinish: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };
type CardPlacement = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'mobile';
type CardLayout = {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  width?: number | string;
  transform?: string;
  placement: CardPlacement;
};

const CARD_WIDTH = 360;
const VIEWPORT_PADDING = 16;
const TARGET_PADDING = 10;

export default function GuidedTour({
  open,
  steps,
  currentStep,
  onNext,
  onPrev,
  onStepSelect,
  onClose,
  onFinish,
}: GuidedTourProps) {
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const lastScrolledSelectorRef = useRef<string | undefined>(undefined);

  const step = steps[currentStep];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    let timeoutId: number | null = null;
    let frameId: number | null = null;
    let isDisposed = false;

    const updateRect = () => {
      if (!step?.selector) {
        setTargetRect(null);
        return;
      }

      const element = document.querySelector(step.selector) as HTMLElement | null;
      if (!element) {
        setTargetRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const resolveTarget = (attempt = 0) => {
      if (isDisposed) return;

      if (!step?.selector) {
        setTargetRect(null);
        return;
      }

      const element = document.querySelector(step.selector) as HTMLElement | null;
      if (element) {
        if (lastScrolledSelectorRef.current !== step.selector) {
          lastScrolledSelectorRef.current = step.selector;
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
          frameId = window.requestAnimationFrame(updateRect);
        } else {
          updateRect();
        }
        return;
      }

      setTargetRect(null);
      if (attempt < 8) {
        timeoutId = window.setTimeout(() => resolveTarget(attempt + 1), 120);
      }
    };

    resolveTarget();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      isDisposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) {
      lastScrolledSelectorRef.current = undefined;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;

    return () => {
      lastFocusedElementRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const focusDialog = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusTarget = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (focusTarget ?? dialog).focus();
    };

    const timeoutId = window.setTimeout(focusDialog, 0);
    return () => window.clearTimeout(timeoutId);
  }, [open, currentStep]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusableElements = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusableElements.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        if (currentStep === steps.length - 1) {
          onFinish();
        } else {
          onNext();
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (currentStep > 0) onPrev();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, currentStep, steps.length, onClose, onFinish, onNext, onPrev]);

  const cardLayout = useMemo<CardLayout>(() => {
    if (typeof window === 'undefined') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        placement: 'center',
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(CARD_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);
    const prefersMobileLayout = viewportWidth < 640;

    if (!targetRect || step?.placement === 'center') {
      return prefersMobileLayout
        ? {
            left: VIEWPORT_PADDING,
            right: VIEWPORT_PADDING,
            bottom: VIEWPORT_PADDING,
            width: 'auto',
            placement: 'mobile',
          }
        : {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            placement: 'center',
          };
    }

    if (prefersMobileLayout) {
      return {
        left: VIEWPORT_PADDING,
        right: VIEWPORT_PADDING,
        bottom: VIEWPORT_PADDING,
        width: 'auto',
        placement: 'mobile',
      };
    }

    const spaceAbove = targetRect.top;
    const spaceBelow = viewportHeight - (targetRect.top + targetRect.height);
    const spaceLeft = targetRect.left;
    const spaceRight = viewportWidth - (targetRect.left + targetRect.width);
    const preferredPlacement = step?.placement ?? 'auto';

    let placement: CardPlacement;
    if (preferredPlacement !== 'auto') {
      placement = preferredPlacement;
    } else if (spaceBelow >= 300 || targetRect.top < 200) {
      placement = 'bottom';
    } else if (spaceRight >= cardWidth + 40) {
      placement = 'right';
    } else if (spaceLeft >= cardWidth + 40) {
      placement = 'left';
    } else if (spaceAbove >= 260) {
      placement = 'top';
    } else {
      placement = 'bottom';
    }

    const unclampedLeft = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, unclampedLeft),
      viewportWidth - cardWidth - VIEWPORT_PADDING
    );

    if (placement === 'bottom') {
      return {
        top: Math.min(
          viewportHeight - 240,
          targetRect.top + targetRect.height + TARGET_PADDING + 8
        ),
        left,
        width: cardWidth,
        placement,
      };
    }

    if (placement === 'top') {
      return {
        top: Math.max(VIEWPORT_PADDING, targetRect.top - 220 - TARGET_PADDING),
        left,
        width: cardWidth,
        placement,
      };
    }

    if (placement === 'right') {
      return {
        top: Math.min(
          Math.max(VIEWPORT_PADDING, targetRect.top + targetRect.height / 2 - 110),
          viewportHeight - 220 - VIEWPORT_PADDING
        ),
        left: Math.min(
          viewportWidth - cardWidth - VIEWPORT_PADDING,
          targetRect.left + targetRect.width + TARGET_PADDING + 14
        ),
        width: cardWidth,
        placement,
      };
    }

    return {
      top: Math.min(
        Math.max(VIEWPORT_PADDING, targetRect.top + targetRect.height / 2 - 110),
        viewportHeight - 220 - VIEWPORT_PADDING
      ),
      left: Math.max(VIEWPORT_PADDING, targetRect.left - cardWidth - TARGET_PADDING - 14),
      width: cardWidth,
      placement: 'left',
    };
  }, [targetRect, step]);

  const pointerStyle = useMemo(() => {
    if (!targetRect) return null;

    const pointerBase = {
      width: 14,
      height: 14,
      transform: 'rotate(45deg)',
    } as const;

    switch (cardLayout.placement) {
      case 'bottom':
        return {
          ...pointerBase,
          top: -7,
          left: Math.min(
            280,
            Math.max(28, targetRect.left + targetRect.width / 2 - Number(cardLayout.left ?? 0) - 7)
          ),
        };
      case 'top':
        return {
          ...pointerBase,
          bottom: -7,
          left: Math.min(
            280,
            Math.max(28, targetRect.left + targetRect.width / 2 - Number(cardLayout.left ?? 0) - 7)
          ),
        };
      case 'right':
        return {
          ...pointerBase,
          left: -7,
          top: Math.min(
            180,
            Math.max(28, targetRect.top + targetRect.height / 2 - Number(cardLayout.top ?? 0) - 7)
          ),
        };
      case 'left':
        return {
          ...pointerBase,
          right: -7,
          top: Math.min(
            180,
            Math.max(28, targetRect.top + targetRect.height / 2 - Number(cardLayout.top ?? 0) - 7)
          ),
        };
      default:
        return null;
    }
  }, [cardLayout, targetRect]);

  if (!mounted || !open || !step) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className={`absolute inset-0 ${targetRect ? 'bg-slate-950/16 backdrop-blur-[1px]' : 'bg-slate-950/72 backdrop-blur-[3px]'}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {targetRect && (
        <div
          className="pointer-events-none fixed rounded-2xl border border-cyan-300/60 shadow-[0_0_0_9999px_rgba(2,6,23,0.68),0_0_0_1px_rgba(34,211,238,0.35),0_0_32px_rgba(34,211,238,0.22)] transition-all duration-300"
          style={{
            top: targetRect.top - TARGET_PADDING,
            left: targetRect.left - TARGET_PADDING,
            width: targetRect.width + TARGET_PADDING * 2,
            height: targetRect.height + TARGET_PADDING * 2,
          }}
        />
      )}

      <div
        ref={dialogRef}
        className="fixed rounded-3xl border border-slate-700/70 bg-slate-950/96 p-5 shadow-[0_30px_80px_rgba(2,6,23,0.55)]"
        style={cardLayout}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-body"
        tabIndex={-1}
      >
        {pointerStyle && (
          <div
            className="absolute border-l border-t border-slate-700/70 bg-slate-950/96"
            style={pointerStyle}
            aria-hidden="true"
          />
        )}

        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                <Sparkles className="h-3 w-3" />
                {step.category || 'Guided Tour'}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                {currentStep + 1} / {steps.length}
              </span>
            </div>
            <h2 id="guided-tour-title" className="text-base font-semibold text-white">
              {step.title}
            </h2>
            <p id="guided-tour-body" className="mt-2 text-sm leading-6 text-slate-300">
              {step.body}
            </p>
            {step.targetLabel && (
              <div className="mt-3 inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/75 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                Focus: {step.targetLabel}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900/70 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close guided tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-800/90">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        {steps.length > 1 && (
          <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
            {steps.map((tourStep, index) => {
              const isActive = index === currentStep;
              return (
                <button
                  key={`${tourStep.title}-${index}`}
                  type="button"
                  onClick={() => onStepSelect?.(index)}
                  className={`min-w-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    isActive
                      ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                      : 'border-slate-700/80 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={currentStep === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              type="button"
              onClick={currentStep === steps.length - 1 ? onFinish : onNext}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25"
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
              {currentStep !== steps.length - 1 && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
