import { useState, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedPanelProps {
  children: ReactNode;
  /** Unique key to trigger re-animation */
  panelKey: string | number;
  className?: string;
}

/**
 * Wraps content with the spec's float-in / fade-out animation.
 * Changes to `panelKey` trigger exit → enter cycle.
 */
export function AnimatedPanel({ children, panelKey, className }: AnimatedPanelProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, [panelKey]);

  return (
    <div
      className={cn(
        'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        className
      )}
    >
      {children}
    </div>
  );
}
