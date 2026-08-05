import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface FlyEvent {
  id: number;
  label: string;
  relX: number;
  relY: number;
  isMult?: boolean;
}

interface WinFlyLayerProps {
  events: FlyEvent[];
  onClear: (id: number) => void;
}

const FLY_DURATION = 1350;

const FlyLabel: React.FC<{ ev: FlyEvent; onDone: () => void }> = ({ ev, onDone }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kf: Keyframe[] = ev.isMult
      ? [
          { opacity: 0, transform: 'translate(-50%, 0) scale(0.5)' },
          { opacity: 1, transform: 'translate(-50%, -18px) scale(1.35)', offset: 0.18 },
          { opacity: 1, transform: 'translate(-50%, -70px) scale(1.15)', offset: 0.55 },
          { opacity: 0, transform: 'translate(-50%, -150px) scale(0.9)' },
        ]
      : [
          { opacity: 0, transform: 'translate(-50%, 0) scale(0.6)' },
          { opacity: 1, transform: 'translate(-50%, -14px) scale(1.2)', offset: 0.12 },
          { opacity: 0.95, transform: 'translate(-50%, -100px) scale(1)', offset: 0.7 },
          { opacity: 0, transform: 'translate(-50%, -140px) scale(0.85)' },
        ];
    const anim = el.animate(kf, {
      duration: ev.isMult ? 1600 : FLY_DURATION,
      easing: 'ease-in-out',
      fill: 'forwards',
    });
    anim.onfinish = onDone;
    return () => anim.cancel();
  }, [onDone, ev.isMult]);

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
        className="font-display font-black text-sm sm:text-base px-2 py-0.5 rounded-lg"
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

  const clearAll = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, emit, clear, clearAll };
}
