import { Sparkles } from 'lucide-react';
import { useState } from 'react';

const MASCOT_SRC = '/assets/image.png';

const STATE_VARIANTS = {
  idle: {
    bg:      'bg-mascot-idle',
    ring:    'ring-slate-700/60',
    glow:    'shadow-[0_0_28px_rgba(109,94,246,0.18)]',
    anim:    'animate-pulse-soft',
  },
  thinking: {
    bg:      'bg-mascot-thinking bg-[length:200%_200%]',
    ring:    'ring-purple-500/40',
    glow:    'shadow-glow',
    anim:    'animate-spin-slow',
  },
  success: {
    bg:      'bg-mascot-success',
    ring:    'ring-purple-400/60',
    glow:    'shadow-glow',
    anim:    'animate-pulse-soft',
  },
  empty: {
    bg:      'bg-mascot-empty',
    ring:    'ring-slate-600/60',
    glow:    'shadow-[0_0_20px_rgba(244,168,47,0.18)]',
    anim:    '',
  },
  error: {
    bg:      'bg-[radial-gradient(circle_at_30%_30%,#FF7A8E_0%,#DC143C_70%)]',
    ring:    'ring-red-400/60',
    glow:    'shadow-[0_0_24px_rgba(220,20,60,0.32)]',
    anim:    'animate-pulse-soft',
  },
};

const SIZE_MAP = {
  sm: { wrap: 'h-9 w-9',  icon: 15 },
  md: { wrap: 'h-12 w-12', icon: 20 },
  lg: { wrap: 'h-20 w-20', icon: 30 },
  xl: { wrap: 'h-28 w-28', icon: 42 },
};

export default function Mascot({ state = 'idle', size = 'md', label }) {
  const variant   = STATE_VARIANTS[state] || STATE_VARIANTS.idle;
  const dimension = SIZE_MAP[size] || SIZE_MAP.md;
  const [hasImage, setHasImage] = useState(true);

  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`relative grid place-items-center overflow-hidden rounded-full bg-transparent ring-1 transition-all duration-500
          ${dimension.wrap} ${variant.ring} ${variant.glow} ${state === 'thinking' ? variant.anim : ''}`}
        aria-hidden="true"
      >
        {hasImage ? (
          <img
            src={MASCOT_SRC}
            alt=""
            className="h-full w-full scale-[1.18] object-cover object-[50%_18%]"
            draggable="false"
            onError={() => setHasImage(false)}
          />
        ) : (
          <div className={`grid h-full w-full place-items-center ${variant.bg} ${variant.anim}`}>
            <Sparkles className="theme-preserve-dark text-white" size={dimension.icon} strokeWidth={2.4} />
          </div>
        )}
      </div>
      {label && (
        <span className="text-sm font-semibold text-slate-300 theme-light:text-slate-700">
          {label}
        </span>
      )}
    </div>
  );
}
