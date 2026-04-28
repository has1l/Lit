export default function Card({ children, className = '' }) {
  return (
    <section
      className={`min-w-0 rounded-[28px] border border-slate-700/70 bg-slate-900/72 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl ${className}`}
    >
      {children}
    </section>
  );
}
