import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

const MASCOT_SOURCES = {
  default: '/assets/image.png',
  support: '/assets/image1.png',
  guide: '/assets/image2.png',
  bright: '/assets/image3.png',
};

const IMAGE_CLASSES = {
  default: 'scale-[1.18] object-cover object-[50%_18%]',
  support: 'scale-[1.18] object-cover object-[50%_18%]',
  guide: 'scale-[1.2] object-cover object-[50%_16%]',
  bright: 'scale-[1.26] object-cover object-[50%_15%]',
};

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
    anim:    'animate-pulse-soft',
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

export default function Mascot({ state = 'idle', size = 'md', label, variant = 'default', src }) {
  const stateVariant = STATE_VARIANTS[state] || STATE_VARIANTS.idle;
  const dimension = SIZE_MAP[size] || SIZE_MAP.md;
  const imageVariant = MASCOT_SOURCES[variant] ? variant : 'default';
  const imageSrc = src || MASCOT_SOURCES[imageVariant];
  const imageClass = IMAGE_CLASSES[imageVariant] || IMAGE_CLASSES.default;
  const [hasImage, setHasImage] = useState(true);

  useEffect(() => {
    setHasImage(true);
  }, [imageSrc]);

  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`relative grid place-items-center overflow-hidden rounded-full bg-transparent ring-1 transition-all duration-500
          ${dimension.wrap} ${stateVariant.ring} ${stateVariant.glow} ${state === 'thinking' ? stateVariant.anim : ''}`}
        aria-hidden="true"
      >
        {hasImage ? (
          <img
            src={imageSrc}
            alt=""
            className={`h-full w-full ${imageClass}`}
            draggable="false"
            onError={() => setHasImage(false)}
          />
        ) : (
          <div className={`grid h-full w-full place-items-center ${stateVariant.bg} ${stateVariant.anim}`}>
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
