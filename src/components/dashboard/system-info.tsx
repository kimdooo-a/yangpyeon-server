interface SystemInfoProps {
  data: {
    hostname: string;
    platform: string;
    nodeVersion: string;
    cpu: { model: string; cores: number };
  };
}

export function SystemInfo({ data }: SystemInfoProps) {
  const rows = [
    { label: "호스트명", value: data.hostname },
    { label: "플랫폼", value: data.platform },
    { label: "Node.js", value: data.nodeVersion },
    { label: "CPU", value: `${data.cpu.model} (${data.cpu.cores}코어)` },
  ];

  return (
    <div className="bg-surface-200 border border-border rounded-lg">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-medium">시스템 정보</h2>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between px-5 py-3 text-sm">
            <span className="text-gray-500">{row.label}</span>
            <span className="text-gray-800">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
