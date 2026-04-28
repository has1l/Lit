/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          bg:           '#08080C',
          surface:      '#121218',
          elevated:     '#1A1A24',
          light:        '#F8F8FA',
          accent:       '#8A2BE2',
          'accent-soft':'rgba(138, 43, 226, 0.16)',
          'accent-dim': '#7000FF',
          danger:       '#DC143C',
          warning:      '#F4A82F',
          text:         '#E1E4E6',
          'text-muted': '#8A98A8',
        },
        slate: {
          50:  '#F4F5F0',
          100: '#E1E4E6',
          200: '#C5CCD2',
          300: '#9BA8B5',
          400: '#6F8094',
          500: '#506578',
          600: '#374C61',
          700: '#1F3552',
          800: '#152944',
          900: '#121218',
          950: '#08080C',
        },
        // We redefine "green" to "purple" here to instantly theme the whole app without changing hundreds of class names
        green: {
          50:  '#F3E8FF',
          100: '#E9D5FF',
          200: '#D8B4FE',
          300: '#C084FC',
          400: '#A855F7',
          500: '#9333EA',
          600: '#7E22CE',
          700: '#6B21A8',
          800: '#581C87',
          900: '#3B0764',
          950: '#2E064D',
        },
      },
      boxShadow: {
        soft:    '0 18px 45px rgba(0, 0, 0, 0.45)',
        card:    '0 10px 28px rgba(0, 0, 0, 0.4)',
        glow:    '0 0 32px rgba(138, 43, 226, 0.25)',
        'inner-brand': 'inset 0 0 0 1px rgba(138, 43, 226, 0.4)',
        glass:   '0 24px 60px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.07)',
      },
      backgroundImage: {
        'mascot-idle':     'radial-gradient(circle at 30% 30%, #1A1A24 0%, #08080C 60%)',
        'mascot-thinking': 'conic-gradient(from 180deg at 50% 50%, #08080C 0%, #8A2BE2 25%, #1A1A24 50%, #8A2BE2 75%, #08080C 100%)',
        'mascot-success':  'radial-gradient(circle at 30% 30%, #D8B4FE 0%, #9333EA 60%, #6B21A8 100%)',
        'mascot-empty':    'radial-gradient(circle at 30% 30%, #F4A82F 0%, #3B0764 70%)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: 0.65, transform: 'scale(1)' },
          '50%':      { opacity: 1,    transform: 'scale(1.04)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        spinSlow: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in':        'fadeIn 0.32s ease-out',
        'pulse-soft':     'pulseSoft 2.4s ease-in-out infinite',
        'gradient-shift': 'gradientShift 5s ease-in-out infinite',
        'spin-slow':      'spinSlow 6s linear infinite',
        shimmer:          'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
