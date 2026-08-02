import React from 'react';

interface RevolverLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const RevolverLogo: React.FC<RevolverLogoProps> = ({ size = 'md', className = '', onClick }) => {
  // Уменьшены размеры в ~1.75 раза для всех вариантов
  const sizeClasses = {
    sm: { text: 'text-xs', icon: 'w-4 h-4', gap: 'gap-0.5' },
    md: { text: 'text-sm', icon: 'w-5 h-5', gap: 'gap-1' },
    lg: { text: 'text-2xl', icon: 'w-8 h-8', gap: 'gap-1.5' },
  }[size];

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center cursor-pointer select-none group ${sizeClasses.gap} ${className}`}
    >
      <span className={`font-display font-black tracking-tight text-white uppercase drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)] ${sizeClasses.text}`}>
        GUN
      </span>

      <div className={`relative flex items-center justify-center shrink-0 ${sizeClasses.icon}`}>
        <div className="absolute inset-0 rounded-full bg-rose-600/30 blur-md group-hover:bg-rose-600/60 transition-all duration-500 animate-pulse-red" />
        <div className="relative w-full h-full animate-spin-slow group-hover:[animation-duration:3s] transition-all duration-300">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_10px_rgba(225,29,72,0.8)]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="metalGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3f3f46" />
                <stop offset="50%" stopColor="#18181b" />
                <stop offset="85%" stopColor="#27272a" />
                <stop offset="100%" stopColor="#09090b" />
              </radialGradient>
              <linearGradient id="crimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="50%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="#881337" />
              </linearGradient>
              <radialGradient id="holeGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000000" />
                <stop offset="70%" stopColor="#111111" />
                <stop offset="100%" stopColor="#e11d48" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="47" fill="url(#metalGrad)" stroke="#e11d48" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="43" stroke="#27272a" strokeWidth="1.5" strokeDasharray="3 2" />
            {[0, 60, 120, 180, 240, 300].map((angle) => (
              <rect key={`notch-${angle}`} x="47.5" y="3" width="5" height="6" rx="1" fill="#e11d48" transform={`rotate(${angle} 50 50)`} />
            ))}
            {[0, 60, 120, 180, 240, 300].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const dist = 26;
              const cx = 50 + dist * Math.sin(rad);
              const cy = 50 - dist * Math.cos(rad);
              return (
                <g key={`chamber-${i}`}>
                  <circle cx={cx} cy={cy} r="11" fill="url(#holeGrad)" stroke="#e11d48" strokeWidth="1.5" />
                  <circle cx={cx} cy={cy} r="5" fill="url(#crimsonGrad)" />
                  <circle cx={cx} cy={cy} r="2" fill="#ffffff" opacity="0.9" />
                </g>
              );
            })}
            <circle cx="50" cy="50" r="11" fill="#18181b" stroke="#e11d48" strokeWidth="2" />
            <circle cx="50" cy="50" r="6" fill="url(#crimsonGrad)" />
            <circle cx="50" cy="50" r="2.5" fill="#000000" />
          </svg>
        </div>
      </div>

      <span className={`font-display font-black tracking-tight text-rose-600 uppercase drop-shadow-[0_0_12px_rgba(225,29,72,0.8)] ${sizeClasses.text}`}>
        GAD
      </span>
    </div>
  );
};
