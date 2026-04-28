export default function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`relative rounded-[28px] p-px shadow-glass bg-gradient-to-br from-white/[0.18] via-white/[0.04] to-purple-500/[0.15] ${className}`}
    >
      <section className="relative min-w-0 overflow-hidden rounded-[27px] bg-white/[0.05] p-5 backdrop-blur-3xl">
        {/* Specular line – simulates light hitting the top edge */}
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        {/* Top-to-bottom inner sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[27px] bg-gradient-to-b from-white/[0.07] to-transparent" />
        {children}
      </section>
    </div>
  );
}
