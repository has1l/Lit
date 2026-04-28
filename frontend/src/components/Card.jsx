export default function Card({ children, className = '' }) {
  return (
    <section
      className={`fintech-surface fintech-card-hover min-w-0 rounded-[24px] p-5 ${className}`}
    >
      {children}
    </section>
  );
}
