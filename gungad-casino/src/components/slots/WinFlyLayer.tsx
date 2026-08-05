import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface FlyEvent {
  id: number;
  label: string;
  /** 0..1 relative X position in the grid */
  relX: number;
  /** 0..1 relative Y position in the grid */
  relY: number;
  isMult?: boolean;
}

interface WinFlyLayerProps {
  events: FlyEvent[];
  onClear: (id: number) => void;
}

interface FlyItem extends FlyEvent {
  done: boolean;
}

const FLY_DURATION = 900;

const FlyLabel: React.FC<{ ev: FlyEvent; onDone: () => void }> = ({ ev, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Animate via Web Animations API
    const kf: Keyframe[] = [
      { opacity: 0, transform: 'translate(-50%, 0) scale(0.6)' },
      { opacity: 1, transform: 'translate(-50%, -14px) scale(1.15)', offset: 0.15 },
      { opacity: 0.9, transform: 'translate(-50%, -80px) scale(1)', offset: 0.8 },
      { opacity: 0, transform: 'translate(-50%, -110px) scale(0.85)' },
    ];
    const anim = el.animate(kf, { duration: FLY_DURATION, easing: 'ease-in-out', fill: 'forwards' });
    anim.onfinish = onDone;
    return () => anim.cancel();
  }, [onDone]);

  return (
    <div
      ref={ref}
      className="absolute pointer-events-none select-none"
      style={{
        left: `${ev.relX * 100}%`,
        top: `${ev.relY * 100}%`,
        opacity: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className={`font-display font-black text-sm sm:text-base px-2 py-0.5 rounded-lg`}
        style={
          ev.isMult
            ? {
                color: '#fbbf24',
                textShadow: '0 0 12px rgba(251,191,36,0.9), 0 1px 0 #000',
                background: 'rgba(20,10,0,0.7)',
              }
            : {
                color: '#f0fdf4',
                textShadow: '0 0 10px rgba(134,239,172,0.9), 0 1px 0 #000',
                background: 'rgba(0,10,5,0.7)',
              }
        }
      >
        {ev.label}
      </span>
    </div>
  );
};

export const WinFlyLayer: React.FC<WinFlyLayerProps> = ({ events, onClear }) => {
  if (events.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {events.map(ev => (
        <FlyLabel key={ev.id} ev={ev} onDone={() => onClear(ev.id)} />
      ))}
    </div>
  );
};

// Hook for managing fly events from parent
let _flyId = 0;
export function useWinFlyLayer() {
  const [events, setEvents] = useState<FlyEvent[]>([]);

  const emit = useCallback((label: string, relX: number, relY: number, isMult = false) => {
    const id = ++_flyId;
    setEvents(ev => [...ev, { id, label, relX, relY, isMult }]);
  }, []);

  const clear = useCallback((id: number) => {
    setEvents(ev => ev.filter(e => e.id !== id));
  }, []);

  return { events, emit, clear };
}
