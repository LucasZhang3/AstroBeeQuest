import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedPanel } from '@/components/ui/AnimatedPanel';

interface EmailGateProps {
  sessionId: string | null;
  onContinue: () => void;
}

function isValidEmail(email: string): boolean {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

export function EmailGate({ sessionId, onContinue }: EmailGateProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    setError('');
    setIsSubmitting(true);

    // Check for admin bypass server-side
    if (!isValidEmail(trimmed)) {
      // Could be a bypass phrase — validate server-side
      try {
        const { data } = await supabase.functions.invoke('verify-bypass', {
          body: { phrase: trimmed },
        });
        if (data?.valid) {
          setIsSubmitting(false);
          onContinue();
          return;
        }
      } catch {
        // Not a valid bypass, fall through to email validation error
      }
      setIsSubmitting(false);
      setError('Please enter a valid email address.');
      return;
    }

    if (!sessionId) {
      setIsSubmitting(false);
      setError('Session not found. Please try again.');
      return;
    }

    const { error: dbError } = await supabase
      .from('email_captures' as any)
      .insert({ session_id: sessionId, email: trimmed } as any);

    setIsSubmitting(false);

    if (dbError && dbError.code !== '23505') {
      console.error('Email save error:', dbError);
      setError('Something went wrong. Please try again.');
      return;
    }

    onContinue();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
      <AnimatedPanel panelKey="email-gate" className="max-w-md w-full space-y-8 text-center">
        {/* Decorative line */}
        <div className="flex items-center justify-center gap-4 text-white/20">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-[10px] font-mono">✦</span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/20" />
        </div>

        <div className="space-y-3">
          <h2 className="text-lg md:text-xl font-mono tracking-[0.15em] uppercase">
            Your Results Await
          </h2>
          <p className="text-sm text-white/50 font-light leading-relaxed">
            Enter your email to reveal your player identity.
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="you@example.com"
            autoFocus
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm font-mono text-white/90 placeholder:text-white/25 focus:outline-none focus:border-white/50 transition-colors duration-300 tracking-wider"
          />
          {error && (
            <p className="text-xs font-mono text-red-400/80 tracking-wide">{error}</p>
          )}
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !email.trim()}
            className="group relative inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-xs tracking-[0.3em] uppercase font-mono transition-all duration-500 hover:bg-white hover:text-black hover:border-white disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="w-1 h-1 bg-white/40 group-hover:bg-black/60 transition-colors duration-500" />
            {isSubmitting ? 'TRANSMITTING...' : 'REVEAL RESULTS'}
          </button>
        </div>
      </AnimatedPanel>
    </div>
  );
}
