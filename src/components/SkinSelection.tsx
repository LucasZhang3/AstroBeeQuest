import { useState } from 'react';
import { AnimatedPanel } from '@/components/ui/AnimatedPanel';
import { skinList, type SkinId } from '@/data/scenes';

interface SkinSelectionProps {
  onSelect: (skinId: SkinId) => void;
}

export function SkinSelection({ onSelect }: SkinSelectionProps) {
  const [selected, setSelected] = useState<SkinId | null>(null);
  const [exiting, setExiting] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setExiting(true);
    setTimeout(() => onSelect(selected), 350);
  };

  return (
    <div
      className={`flex-1 flex flex-col items-center px-6 py-8 pb-24 overflow-y-auto transition-all duration-300 ease-in-out ${
        exiting ? 'opacity-0 translate-y-1.5' : ''
      }`}
    >
      <AnimatedPanel panelKey="skin-select" className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-4 text-white/20">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/20" />
            <span className="text-[10px] font-mono">◆</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/20" />
          </div>
          <h2 className="text-lg md:text-xl font-mono tracking-[0.2em] uppercase text-white/80">
            Choose Your World
          </h2>
          <p className="text-xs text-white/40 font-light">
            Each journey asks the same questions through a different lens
          </p>
        </div>

        {/* Skin list */}
        <div className="space-y-3">
          {skinList.map((skin) => (
            <button
              key={skin.id}
              onClick={() => setSelected(skin.id)}
              className={`w-full text-left px-5 py-4 border transition-all duration-300 font-mono group ${
                selected === skin.id
                  ? 'border-white/50 bg-white/5'
                  : 'border-white/10 hover:border-white/25 hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                    selected === skin.id ? 'bg-white/80' : 'bg-white/20'
                  }`}
                />
                <span className="text-xs tracking-[0.2em] uppercase text-white/80">
                  {skin.name}
                </span>
              </div>
              <p className="mt-1.5 ml-[18px] text-[11px] text-white/40 font-light leading-relaxed">
                {skin.description}
              </p>
            </button>
          ))}
        </div>

        {/* Confirm button */}
        <div className="flex justify-center pt-2">
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="group relative inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-xs tracking-[0.3em] uppercase font-mono transition-all duration-500 hover:bg-white hover:text-black hover:border-white disabled:opacity-20 disabled:pointer-events-none"
          >
            <span className="w-1 h-1 bg-white/40 group-hover:bg-black/60 transition-colors duration-500" />
            Enter
          </button>
        </div>
      </AnimatedPanel>
    </div>
  );
}
