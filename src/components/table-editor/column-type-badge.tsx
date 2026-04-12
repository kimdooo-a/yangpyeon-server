interface ColumnTypeBadgeProps {
  dataType: string;
}

const TYPE_COLORS: Record<string, string> = {
  text: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  varchar: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "character varying": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  integer: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  bigint: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  smallint: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  numeric: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  real: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "double precision": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  boolean: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  timestamp: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "timestamp without time zone":
    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "timestamp with time zone":
    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  date: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  uuid: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  jsonb: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  json: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "USER-DEFINED": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

const DEFAULT_COLOR = "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";

export function ColumnTypeBadge({ dataType }: ColumnTypeBadgeProps) {
  const color = TYPE_COLORS[dataType.toLowerCase()] ?? DEFAULT_COLOR;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono ${color}`}
    >
      {dataType}
    </span>
  );
}
