import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  percent?: number;
  color?: "brand" | "blue" | "amber" | "purple" | "red";
  children?: ReactNode;
}

const colorMap = {
  brand: { bar: "bg-emerald-500", text: "text-emerald-400" },
  blue: { bar: "bg-blue-500", text: "text-blue-400" },
  amber: { bar: "bg-amber-500", text: "text-amber-400" },
  purple: { bar: "bg-purple-500", text: "text-purple-400" },
  red: { bar: "bg-red-500", text: "text-red-400" },
};

export function StatCard({ title, value, subtitle, percent, color = "brand", children }: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div className="bg-surface-200 border border-border rounded-lg p-5">
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${colors.text}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>

      {percent !== undefined && (
        <div className="mt-3">
          <div className="w-full h-1.5 bg-surface-400 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
