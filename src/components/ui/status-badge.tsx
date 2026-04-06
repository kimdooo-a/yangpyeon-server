interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusStyles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  online: { bg: "bg-emerald-900/30", text: "text-emerald-400", dot: "bg-emerald-400", label: "online" },
  stopped: { bg: "bg-gray-800/50", text: "text-gray-400", dot: "bg-gray-500", label: "stopped" },
  errored: { bg: "bg-red-900/30", text: "text-red-400", dot: "bg-red-400", label: "errored" },
  launching: { bg: "bg-yellow-900/30", text: "text-yellow-400", dot: "bg-yellow-400", label: "launching" },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const style = statusStyles[status] ?? statusStyles.launching;
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <span className={`inline-flex items-center gap-1.5 ${padding} rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
