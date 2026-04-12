import { useState } from 'react';
import { AnimatedPanel } from '@/components/ui/AnimatedPanel';

interface LandingContentProps {
  onStart: () => void;
}

export function LandingContent({ onStart }: LandingContentProps) {
  const [exiting, setExiting] = useState(false);

  const handleStart = () => {
    setExiting(true);
    setTimeout(onStart, 350);
  };

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center px-6 transition-all duration-300 ease-in-out ${
      exiting ? 'opacity-0 translate-y-1.5' : ''}`
      }>
      
      <AnimatedPanel panelKey="landing" className="max-w-lg w-full text-center space-y-8">
        {/* Top decorative line */}
        <div className="flex items-center justify-center gap-4 text-white/20">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-xs">∞</span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-white/20" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <h1 className="text-4xl md:text-6xl font-bold tracking-[0.15em] uppercase font-mono">
            ASTROBEE EMPORIUM
          </h1>
        </div>

        {/* Description */}
        <p className="text-sm md:text-base leading-relaxed text-white/60 font-light max-w-md mx-auto">
          Like Atlas we press onward, each choice a step, each challenge a stone, every path shaping the hero we become
        </p>

        {/* Single Button */}
        <div className="pt-4">
          <button
            onClick={handleStart}
            className="group relative inline-flex items-center gap-3 px-10 py-4 border border-white/20 text-sm tracking-[0.3em] uppercase font-mono transition-all duration-500 hover:bg-white hover:text-black hover:border-white hover:tracking-[0.4em] hover:shadow-[0_0_40px_rgba(255,255,255,0.15)]">
            
            <span className="w-1.5 h-1.5 bg-white/40 group-hover:bg-black/60 transition-colors duration-500" />
            <span className="w-px h-4 bg-white/10 group-hover:bg-black/20 transition-colors duration-500" />
            BEGIN THE CLIMB
          </button>
        </div>
      </AnimatedPanel>
    </div>);

}