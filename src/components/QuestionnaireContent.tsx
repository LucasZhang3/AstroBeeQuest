import { useState, useEffect, useRef } from 'react';
import { skins, type SkinId } from '@/data/scenes';
import { ResponseInput } from './ResponseInput';
import { AnimatedPanel } from '@/components/ui/AnimatedPanel';
import { useSession } from '@/hooks/useSession';

interface QuestionnaireContentProps {
  skinId: SkinId;
  onComplete: (sessionId: string | null) => void;
}

export function QuestionnaireContent({ skinId, onComplete }: QuestionnaireContentProps) {
  const scenes = skins[skinId].scenes;
  const {
    sessionId,
    currentScene,
    status,
    currentResponse,
    isLoading,
    error,
    saveResponseAndAdvance,
  } = useSession();

  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setInputValue(currentResponse);
  }, [currentResponse, currentScene]);

  // Focus heading on scene change for accessibility
  useEffect(() => {
    headingRef.current?.focus();
  }, [currentScene]);

  useEffect(() => {
    if (status === 'completed') {
      onComplete(sessionId);
    }
  }, [status, sessionId, onComplete]);

  const sceneIndex = currentScene - 1;
  const scene = scenes[sceneIndex];
  const isLastScene = currentScene === 12;
  const progress = (currentScene / scenes.length) * 100;

  const handleNext = async () => {
    if (!inputValue.trim()) return;
    setIsSaving(true);
    await saveResponseAndAdvance(inputValue, currentScene);
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/50 font-mono text-sm animate-pulse">LOADING QUEST DATA...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/50 font-mono text-sm">ERROR: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
      <AnimatedPanel panelKey={currentScene} className="max-w-xl w-full space-y-6">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono text-white/40 uppercase tracking-[0.3em]">
            <span>Quest {currentScene} of {scenes.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-px bg-white/10 overflow-hidden">
            <div
              className="h-full bg-white/40 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Decorative line */}
        <div className="flex items-center justify-center gap-4 text-white/20">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-[10px] font-mono">✦</span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-white/20" />
        </div>

        {/* Question text */}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-base md:text-lg leading-relaxed text-white/80 font-light text-center outline-none"
        >
          {scene.promptText}
        </h2>

        {/* Input */}
        <div className="questionnaire-input">
          <ResponseInput
            value={inputValue}
            onChange={setInputValue}
            characterLimit={scene.characterLimit}
          />
        </div>

        {/* Action button */}
        <div className="flex justify-center pt-2">
          <button
            onClick={handleNext}
            disabled={isSaving || !inputValue.trim()}
            className="group relative inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-xs tracking-[0.3em] uppercase font-mono transition-all duration-500 hover:bg-white hover:text-black hover:border-white disabled:opacity-30 disabled:pointer-events-none"
          >
            <span className="w-1 h-1 bg-white/40 group-hover:bg-black/60 transition-colors duration-500" />
            {isSaving ? 'TRANSMITTING...' : isLastScene ? 'SUBMIT' : 'NEXT'}
          </button>
        </div>
      </AnimatedPanel>
    </div>
  );
}
