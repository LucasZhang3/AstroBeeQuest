import { useState, useCallback } from 'react';
import { BackgroundLayout } from '@/components/ui/BackgroundLayout';
import { LandingContent } from '@/components/LandingContent';
import { SkinSelection } from '@/components/SkinSelection';
import { QuestionnaireContent } from '@/components/QuestionnaireContent';
import { EmailGate } from '@/components/EmailGate';
import { ResultsContent } from '@/components/ResultsContent';
import type { SkinId } from '@/data/scenes';

type AppPhase = 'landing' | 'skin-select' | 'questionnaire' | 'email' | 'results';

const Index = () => {
  const [phase, setPhase] = useState<AppPhase>('landing');
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [selectedSkin, setSelectedSkin] = useState<SkinId>('dungeon');

  const handleComplete = useCallback((sessionId: string | null) => {
    setCompletedSessionId(sessionId);
    setPhase('email');
  }, []);

  const handleSkinSelect = useCallback((skinId: SkinId) => {
    setSelectedSkin(skinId);
    setPhase('questionnaire');
  }, []);

  return (
    <BackgroundLayout animated={phase === 'landing'}>
      {phase === 'landing' && (
        <LandingContent onStart={() => setPhase('skin-select')} />
      )}
      {phase === 'skin-select' && (
        <SkinSelection onSelect={handleSkinSelect} />
      )}
      {phase === 'questionnaire' && (
        <QuestionnaireContent skinId={selectedSkin} onComplete={handleComplete} />
      )}
      {phase === 'email' && (
        <EmailGate sessionId={completedSessionId} onContinue={() => setPhase('results')} />
      )}
      {phase === 'results' && (
        <ResultsContent sessionId={completedSessionId} />
      )}
    </BackgroundLayout>
  );
};

export default Index;
