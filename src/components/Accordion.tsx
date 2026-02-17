import React, { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
}

/**
 * Accordion - Collapsible section for progressive disclosure
 *
 * Uses native HTML details/summary for accessibility and simplicity.
 * Styled to match the dark glass design system.
 */
export default function Accordion({ title, children, defaultOpen = false, badge }: AccordionProps) {
  return (
    <details
      className="glass-panel rounded-xl border border-white/10 overflow-hidden group"
      open={defaultOpen}
    >
      <summary className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {badge !== undefined && (
            <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-300 rounded-full border border-cyan-500/30">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="p-4 pt-0 border-t border-white/5">{children}</div>
    </details>
  );
}
