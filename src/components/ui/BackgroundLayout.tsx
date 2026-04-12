import { useEffect, ReactNode } from 'react';

interface BackgroundLayoutProps {
  children: ReactNode;
  /** Show animated UnicornStudio background (landing only) */
  animated?: boolean;
}

export function BackgroundLayout({ children, animated = false }: BackgroundLayoutProps) {
  useEffect(() => {
    if (!animated) return;

    const embedScript = document.createElement('script');
    embedScript.type = 'text/javascript';
    embedScript.textContent = `
      !function(){
        if(!window.UnicornStudio){
          window.UnicornStudio={isInitialized:!1};
          var i=document.createElement("script");
          i.src="/vendor/unicornStudio.umd.js";
          i.onload=function(){
            window.UnicornStudio.isInitialized||(UnicornStudio.init(),window.UnicornStudio.isInitialized=!0)
          };
          (document.head || document.body).appendChild(i)
        }
      }();
    `;
    document.head.appendChild(embedScript);

    const style = document.createElement('style');
    style.textContent = `
      [data-us-project] { position: relative !important; overflow: hidden !important; }
      [data-us-project] canvas { clip-path: inset(0 0 10% 0) !important; }
      [data-us-project] * { pointer-events: none !important; }
      [data-us-project] a[href*="unicorn"],
      [data-us-project] button[title*="unicorn"],
      [data-us-project] div[title*="Made with"],
      [data-us-project] .unicorn-brand,
      [data-us-project] [class*="brand"],
      [data-us-project] [class*="credit"],
      [data-us-project] [class*="watermark"] {
        display: none !important; visibility: hidden !important; opacity: 0 !important;
        position: absolute !important; left: -9999px !important; top: -9999px !important;
      }
    `;
    document.head.appendChild(style);

    const hideBranding = () => {
      ['[data-us-project]', '[data-us-project="OMzqyUv6M3kSnv0JeAtC"]'].forEach((selector) => {
        document.querySelectorAll(selector).forEach((container) => {
          container.querySelectorAll('*').forEach((el) => {
            const h = el as HTMLElement;
            const t = (h.textContent || '').toLowerCase();
            const ti = (h.getAttribute('title') || '').toLowerCase();
            const hr = (h.getAttribute('href') || '').toLowerCase();
            if (t.includes('made with') || t.includes('unicorn') || ti.includes('unicorn') || hr.includes('unicorn.studio')) {
              h.style.display = 'none';
              try {h.remove();} catch (e) {}
            }
          });
        });
      });
    };

    hideBranding();
    const interval = setInterval(hideBranding, 50);
    const timeouts = [500, 1000, 2000, 5000, 10000].map((t) => setTimeout(hideBranding, t));

    return () => {
      clearInterval(interval);
      timeouts.forEach(clearTimeout);
      try {document.head.removeChild(embedScript);document.head.removeChild(style);} catch (e) {}
    };
  }, [animated]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white flex flex-col">
      {/* Animated background — only on landing */}
      {animated &&
      <>
          <div className="absolute inset-0 z-0">
            <div data-us-project="OMzqyUv6M3kSnv0JeAtC" style={{ width: '100%', height: '100%' }} />
          </div>
          <div className="absolute inset-0 z-0 md:hidden hero-stars-bg" />
        </>
      }

      <HeroHeader />
      <CornerAccents />

      <main className="relative z-10 flex-1 flex flex-col" aria-live="polite">
        {children}
      </main>

      <FooterStatus showPulse={animated} />
    </div>);

}

function HeroHeader() {
  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-5 text-[10px] tracking-[0.3em] uppercase opacity-50 font-mono">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-white/70 font-semibold tracking-[0.4em]">ASTROBEE</span>
          <span className="w-px h-3 bg-white/20" />
          <span className="text-white/40">EST. 2026</span>
        </div>
        <div className="flex items-center gap-2 text-white/30 text-[8px]">
          <span>LAT: 38.8831°</span>
          <span className="w-px h-2 bg-white/10" />
          <span>LONG: -77.0162°</span>
        </div>
      </div>
    </header>);

}

function CornerAccents() {
  return (
    <>
      <div className="absolute top-4 left-4 w-8 h-8 border-t border-l border-white/10 z-10" />
      <div className="absolute top-4 right-4 w-8 h-8 border-t border-r border-white/10 z-10" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-b border-l border-white/10 z-10" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-b border-r border-white/10 z-10" />
    </>);

}

function FooterStatus({ showPulse }: {showPulse: boolean;}) {
  return (
    <div className="absolute left-0 right-0 z-20 border-t border-white/20 bg-black/40 backdrop-blur-sm" style={{ bottom: '5vh' }}>
      <div className="container mx-auto px-4 lg:px-8 py-2 lg:py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 lg:gap-6 text-[8px] lg:text-[9px] font-mono text-white/50">
          <span className="hidden lg:inline">SYSTEM.ACTIVE</span>
          <span className="lg:hidden">SYS.ACT</span>
          <div className="hidden lg:flex gap-1">
            {Array.from({ length: 8 }).map((_, i) =>
            <div key={i} className="w-1 bg-white/30" style={{ height: `${6 + i * 3 % 12}px` }} />
            )}
          </div>
          <span>V1.0.0</span>
        </div>
        <div className="flex items-center gap-2 lg:gap-4 text-[8px] lg:text-[9px] font-mono text-white/50">
          <span className="hidden lg:inline">◐ RENDERING</span>
          {showPulse &&
          <div className="flex gap-1">
              <div className="w-1 h-1 bg-white/60 rounded-full animate-pulse" />
              <div className="w-1 h-1 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-1 h-1 bg-white/20 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          }
          <span className="hidden lg:inline">ZHANG: ∞</span>
        </div>
      </div>
    </div>);

}