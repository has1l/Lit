const variants = {
  primary: 'bg-purple-600 text-white shadow-lg shadow-purple-900/50 hover:bg-purple-500',
  secondary: 'bg-black/70 text-white ring-1 ring-purple-500/60 hover:bg-purple-950/60',
  ghost: 'text-slate-300 hover:bg-slate-800',
};

export default function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition active:scale-[0.98] ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
