/** Venue lifecycle badge — shared by every /admin screen. */
export function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "border-green-400/30 bg-green-400/10 text-green-300",
    rejected: "border-red-400/30 bg-red-400/10 text-red-300",
    pending: "border-gold/30 bg-gold/10 text-gold-2",
    archived: "border-line bg-white/[0.04] text-fog-2",
  };
  return (
    <span
      className={`rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-widest ${styles[status] ?? styles.pending}`}
    >
      {status}
    </span>
  );
}
