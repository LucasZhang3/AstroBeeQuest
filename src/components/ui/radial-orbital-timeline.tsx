import { useState, useEffect, useRef } from "react";
import { Zap, ArrowRight } from "lucide-react";
import { scenes } from "@/data/scenes";

interface TimelineItem {
  id: number;
  title: string;
  content: string;
  category: string;
  icon: React.ElementType;
  relatedIds: number[];
  energy: number;
  isTopType: boolean;
  rank: number;
  rankColor?: string;
  quotes?: Array<{ scene_id: number; quote: string }>;
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
}

const RANK_NODE_COLORS = [
  { ring: "rgba(251,191,36,0.6)", glow: "rgba(251,191,36,0.25)", text: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
  { ring: "rgba(56,189,248,0.6)", glow: "rgba(56,189,248,0.25)", text: "#38bdf8", bg: "rgba(56,189,248,0.15)" },
  { ring: "rgba(251,146,60,0.6)", glow: "rgba(251,146,60,0.25)", text: "#fb923c", bg: "rgba(251,146,60,0.15)" },
];

export default function RadialOrbitalTimeline({ timelineData }: RadialOrbitalTimelineProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedId(null);
      setAutoRotate(true);
    }
  };

  const toggleItem = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setAutoRotate(true);
    } else {
      setExpandedId(id);
      setAutoRotate(false);
      // Center the clicked node at the top
      const nodeIndex = timelineData.findIndex((item) => item.id === id);
      const targetAngle = (nodeIndex / timelineData.length) * 360;
      setRotationAngle(270 - targetAngle);
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (autoRotate) {
      timer = setInterval(() => {
        setRotationAngle((prev) => Number(((prev + 0.3) % 360).toFixed(3)));
      }, 50);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [autoRotate]);

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = 180;
    const radian = (angle * Math.PI) / 180;
    const x = radius * Math.cos(radian);
    const y = radius * Math.sin(radian);
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const scale = 0.7 + 0.3 * ((1 + Math.sin(radian)) / 2);
    const opacity = Math.max(0.35, Math.min(1, 0.35 + 0.65 * ((1 + Math.sin(radian)) / 2)));
    return { x, y, zIndex, opacity, scale };
  };

  const getRelatedItems = (itemId: number): number[] => {
    const item = timelineData.find((i) => i.id === itemId);
    return item ? item.relatedIds : [];
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full flex items-center justify-center overflow-visible cursor-pointer"
      style={{ minHeight: "520px" }}
      onClick={handleContainerClick}
    >
      <div ref={orbitRef} className="relative" style={{ width: "460px", height: "460px" }}>
        {/* Center hub */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center pointer-events-none">
          <div className="text-2xl mb-1 text-amber-400">✦</div>
          <p className="text-[10px] font-mono text-white/30 tracking-[0.2em] uppercase">
            {expandedId ? "Tap empty space to close" : "Tap a node"}
          </p>
        </div>

        {/* Orbit rings */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed pointer-events-none"
          style={{ width: "360px", height: "360px", borderColor: "rgba(255,255,255,0.08)" }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed pointer-events-none"
          style={{ width: "260px", height: "260px", borderColor: "rgba(255,255,255,0.04)" }} />

        {/* Connection lines to related nodes */}
        {expandedId && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 50 }}>
            {(() => {
              const activeIndex = timelineData.findIndex((i) => i.id === expandedId);
              const activePos = calculateNodePosition(activeIndex, timelineData.length);
              const relatedIds = getRelatedItems(expandedId);
              return relatedIds.map((relId) => {
                const relIndex = timelineData.findIndex((i) => i.id === relId);
                if (relIndex === -1) return null;
                const relPos = calculateNodePosition(relIndex, timelineData.length);
                return (
                  <line
                    key={relId}
                    x1={230 + activePos.x} y1={230 + activePos.y}
                    x2={230 + relPos.x} y2={230 + relPos.y}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                );
              });
            })()}
          </svg>
        )}

        {/* Nodes */}
        {timelineData.map((item, index) => {
          const position = calculateNodePosition(index, timelineData.length);
          const isExpanded = expandedId === item.id;
          const isRelated = expandedId ? getRelatedItems(expandedId).includes(item.id) : false;
          const Icon = item.icon;

          // Color by rank for top 3
          const rankStyle = item.isTopType && item.rank <= 3 ? RANK_NODE_COLORS[item.rank - 1] : null;
          const nodeSize = isExpanded ? 52 : item.isTopType ? 44 : 34;

          return (
            <div
              key={item.id}
              className="absolute transition-all duration-700 ease-out cursor-pointer"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${isExpanded ? 1 : position.scale})`,
                zIndex: isExpanded ? 200 : position.zIndex,
                opacity: isExpanded ? 1 : expandedId && !isRelated ? position.opacity * 0.5 : position.opacity,
              }}
              onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}
            >
              {/* Pulse for related */}
              {isRelated && (
                <div className="absolute -inset-3 rounded-full animate-ping" style={{ background: "rgba(255,255,255,0.08)" }} />
              )}

              {/* Node circle */}
              <div
                className="relative flex items-center justify-center rounded-full transition-all duration-300"
                style={{
                  width: nodeSize,
                  height: nodeSize,
                  background: rankStyle ? rankStyle.bg : "rgba(255,255,255,0.06)",
                  border: `2px solid ${rankStyle ? rankStyle.ring : "rgba(255,255,255,0.15)"}`,
                  boxShadow: rankStyle ? `0 0 16px ${rankStyle.glow}` : isExpanded ? "0 0 12px rgba(255,255,255,0.1)" : "none",
                }}
              >
                <Icon
                  size={isExpanded ? 22 : item.isTopType ? 18 : 14}
                  color={rankStyle ? rankStyle.text : "rgba(255,255,255,0.5)"}
                />
              </div>

              {/* Label below node */}
              <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center" style={{ top: "calc(100% + 6px)" }}>
                <span
                  className="font-mono block"
                  style={{
                    fontSize: item.isTopType ? "0.65rem" : "0.55rem",
                    fontWeight: item.isTopType ? 600 : 400,
                    color: rankStyle ? rankStyle.text : "rgba(255,255,255,0.4)",
                  }}
                >
                  {item.title}
                </span>
                {item.isTopType && (
                  <span className="block font-mono" style={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.25)" }}>
                    #{item.rank} · {Math.round(item.energy)}%
                  </span>
                )}
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-72 rounded-lg backdrop-blur-md"
                  style={{
                    top: "calc(100% + 40px)",
                    background: "rgba(0,0,0,0.85)",
                    border: `1px solid ${rankStyle ? rankStyle.ring : "rgba(255,255,255,0.15)"}`,
                    zIndex: 300,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon size={16} color={rankStyle ? rankStyle.text : "rgba(255,255,255,0.6)"} />
                        <span className="font-mono text-sm tracking-[0.1em]" style={{ color: rankStyle ? rankStyle.text : "white" }}>
                          {item.title}
                        </span>
                      </div>
                      <span className="font-mono text-xs" style={{ color: rankStyle ? rankStyle.text : "rgba(255,255,255,0.5)" }}>
                        {item.energy.toFixed(1)}%
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-xs leading-relaxed text-white/50">{item.content}</p>

                    {/* Score bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-white/30 flex items-center gap-1">
                          <Zap size={10} /> SCORE
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(item.energy * 2, 100)}%`,
                            background: rankStyle ? rankStyle.text : "rgba(255,255,255,0.3)",
                          }}
                        />
                      </div>
                    </div>

                    {/* Evidence quotes */}
                    {item.quotes && item.quotes.length > 0 && (
                      <div className="space-y-2.5 pt-2 border-t border-white/10">
                        <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.3em]">
                          Evidence from your journey
                        </p>
                        {item.quotes.map((q, qi) => (
                          <div key={qi} className="pl-3" style={{ borderLeft: `2px solid ${rankStyle ? rankStyle.ring : "rgba(255,255,255,0.1)"}` }}>
                            <p className="text-[11px] text-white/60 italic leading-relaxed">"{q.quote}"</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Related types */}
                    {item.relatedIds.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-white/10">
                        <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">Related</p>
                        <div className="flex flex-wrap gap-1">
                          {item.relatedIds.map((relatedId) => {
                            const related = timelineData.find((i) => i.id === relatedId);
                            if (!related) return null;
                            return (
                              <button
                                key={relatedId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-[10px] font-mono text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
                                onClick={(e) => { e.stopPropagation(); toggleItem(relatedId); }}
                              >
                                {related.title}
                                <ArrowRight size={8} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
