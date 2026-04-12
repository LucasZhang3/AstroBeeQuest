import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedPanel } from '@/components/ui/AnimatedPanel';
import RadialOrbitalTimeline from '@/components/ui/radial-orbital-timeline';
import {
  Drama, Compass, Flame, Trophy, Sword, BookOpen, Brain, Eye,
} from 'lucide-react';
import { scenes } from '@/data/scenes';

// Distinct colors for top 3 ranks — gold, silver-blue, bronze-copper
const RANK_COLORS = [
  'text-amber-400',    // #1 gold / star
  'text-sky-400',      // #2 celestial blue
  'text-orange-400',   // #3 ember
];

const TYPE_META: Record<string, { description: string; icon: React.ElementType }> = {
  Actor: { description: 'You live to inhabit characters, speak in-voice, and express emotions through roleplay.', icon: Drama },
  Explorer: { description: "You're driven by curiosity, uncovering hidden lore and pushing into uncharted territory.", icon: Compass },
  Instigator: { description: "You thrive on shaking things up. Predictability bores you.", icon: Flame },
  PowerGamer: { description: 'You love mastering systems, optimizing builds, and finding the most effective path.', icon: Trophy },
  Slayer: { description: 'Combat is your element. Tactical challenges and the thrill of the fight.', icon: Sword },
  Storyteller: { description: 'You care deeply about narrative arcs, character development, and shared stories.', icon: BookOpen },
  Thinker: { description: 'Puzzles, strategy, and clever solutions are what draw you in.', icon: Brain },
  Watcher: { description: 'You enjoy being present, absorbing the experience as it unfolds.', icon: Eye },
};

const TYPE_RELATIONS: Record<string, string[]> = {
  Actor: ['Storyteller', 'Watcher', 'Instigator'],
  Explorer: ['Storyteller', 'Instigator', 'Thinker'],
  Instigator: ['Slayer', 'Actor', 'Explorer'],
  PowerGamer: ['Thinker', 'Slayer'],
  Slayer: ['Instigator', 'PowerGamer', 'Watcher'],
  Storyteller: ['Actor', 'Explorer', 'Thinker'],
  Thinker: ['PowerGamer', 'Storyteller', 'Explorer'],
  Watcher: ['Actor', 'Storyteller', 'Slayer'],
};

const RANK_BAR_COLORS = [
  'bg-amber-400',
  'bg-sky-400',
  'bg-orange-400',
];

interface TopType {
  type: string;
  pct: number;
  quotes: Array<{ scene_id: number; quote: string }>;
}

interface ScoringResults {
  percentages: Record<string, number>;
  top_types: TopType[];
}

interface ResultsContentProps {
  sessionId: string | null;
}

export function ResultsContent({ sessionId }: ResultsContentProps) {
  const [results, setResults] = useState<ScoringResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) { setIsLoading(false); return; }

    const fetchResults = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('score-session', {
          body: { session_id: sessionId },
        });
        if (fnError) { setError('Failed to compute results.'); return; }
        if (data.error) { setError(data.error); return; }
        setResults({
          percentages: data.percentages || {},
          top_types: data.top_types || [],
        });
      } catch {
        setError('Something went wrong. Please try refreshing.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchResults();
  }, [sessionId]);

  const handleRestart = () => {
    localStorage.removeItem('astrobee_session_id');
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="text-2xl text-amber-400 animate-pulse">✦</div>
        <p className="font-mono text-sm text-white/50 tracking-[0.3em] uppercase">Reading the Stars...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="text-2xl">⚠</div>
        <p className="font-mono text-sm text-white/60">{error}</p>
      </div>
    );
  }

  if (!results || (results.top_types.length === 0 && Object.keys(results.percentages).length === 0)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <AnimatedPanel panelKey="no-results" className="text-center space-y-4">
          <div className="text-2xl text-amber-400">✦</div>
          <h2 className="font-mono text-lg tracking-[0.15em] uppercase">Quest Complete</h2>
          <p className="text-sm text-white/50">Your journey has been recorded in the cosmic ledger.</p>
          <button onClick={handleRestart} className="mt-4 inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-xs tracking-[0.3em] uppercase font-mono transition-all duration-500 hover:bg-white hover:text-black">
            BEGIN ANEW
          </button>
        </AnimatedPanel>
      </div>
    );
  }

  const sortedTypes = Object.entries(results.percentages)
    .sort(([, a], [, b]) => b - a)
    .map(([type, pct], index) => ({ type, pct, rank: index + 1 }));

  const top3Names = new Set(sortedTypes.slice(0, 3).map((t) => t.type));

  const quotesMap: Record<string, TopType['quotes']> = {};
  results.top_types.forEach((tt) => { quotesMap[tt.type] = tt.quotes; });

  const timelineData = sortedTypes.map((st) => {
    const meta = TYPE_META[st.type] || { description: st.type, icon: Eye };
    const relatedNames = TYPE_RELATIONS[st.type] || [];
    const relatedIds = relatedNames
      .map((name) => sortedTypes.findIndex((s) => s.type === name) + 1)
      .filter((id) => id > 0);

    return {
      id: st.rank,
      title: st.type,
      content: meta.description,
      category: st.type,
      icon: meta.icon,
      relatedIds,
      energy: st.pct,
      isTopType: top3Names.has(st.type),
      rank: st.rank,
      quotes: quotesMap[st.type] || [],
    };
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 pb-24 overflow-y-auto">
      <AnimatedPanel panelKey="results" className="w-full max-w-2xl space-y-4">
        <div className="text-center space-y-1">
          <h1 className="font-mono text-xl tracking-[0.15em] uppercase">
            Your Player Identity
          </h1>
          <p className="text-xs text-white/40 font-mono tracking-[0.2em] uppercase">
            Tap a node to explore
          </p>
        </div>

        <RadialOrbitalTimeline timelineData={timelineData} />

        <div className="flex justify-center pt-2">
          <button onClick={handleRestart} className="inline-flex items-center gap-3 px-8 py-3 border border-white/20 text-xs tracking-[0.3em] uppercase font-mono transition-all duration-500 hover:bg-white hover:text-black">
            BEGIN ANEW
          </button>
        </div>
      </AnimatedPanel>
    </div>
  );
}
