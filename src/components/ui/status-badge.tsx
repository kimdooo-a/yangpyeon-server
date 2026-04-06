interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusStyles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  online: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", label: "online" },
  stopped: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", label: "stopped" },
  errored: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", label: "errored" },
  launching: { bg: "bg-yellow-50", text: "text-yellow-600", dot: "bg-yellow-500", label: "launching" },
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
