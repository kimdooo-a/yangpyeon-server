// 파일 타입별 아이콘 + 색상 매핑

interface FileTypeIconProps {
  mimeType: string;
  size?: number;
}

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  "application/pdf": { color: "text-red-400", label: "PDF" },
  "image/": { color: "text-green-400", label: "IMG" },
  "text/": { color: "text-gray-400", label: "TXT" },
  "application/zip": { color: "text-yellow-400", label: "ZIP" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml": { color: "text-emerald-400", label: "XLS" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml": { color: "text-blue-400", label: "DOC" },
  "application/vnd.openxmlformats-officedocument.presentationml": { color: "text-orange-400", label: "PPT" },
  "application/vnd.ms-excel": { color: "text-emerald-400", label: "XLS" },
  "application/msword": { color: "text-blue-400", label: "DOC" },
  "application/json": { color: "text-yellow-300", label: "JSON" },
};

function getTypeConfig(mimeType: string) {
  // 정확히 일치하는 키 우선
  if (TYPE_CONFIG[mimeType]) return TYPE_CONFIG[mimeType];
  // 접두사 매칭
  for (const [prefix, config] of Object.entries(TYPE_CONFIG)) {
    if (mimeType.startsWith(prefix)) return config;
  }
  return { color: "text-gray-500", label: "FILE" };
}

export function FileTypeIcon({ mimeType, size = 32 }: FileTypeIconProps) {
  const config = getTypeConfig(mimeType);

  return (
    <div
      className={`flex items-center justify-center rounded-md bg-surface-300 border border-border ${config.color}`}
      style={{ width: size, height: size }}
    >
      <span className="text-[9px] font-bold leading-none">{config.label}</span>
    </div>
  );
}
