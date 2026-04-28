const variants = {
  primary: 'fintech-button-primary border border-transparent',
  secondary: 'fintech-button-secondary',
  ghost: 'fintech-button-ghost',
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
