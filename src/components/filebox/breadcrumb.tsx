"use client";

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (folderId: string) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      {items.map((item, i) => (
        <span key={item.id} className="flex items-center gap-1 shrink-0">
          {i > 0 && <span className="text-gray-500">/</span>}
          {i < items.length - 1 ? (
            <button
              onClick={() => onNavigate(item.id)}
              className="text-gray-500 hover:text-brand transition-colors"
            >
              {item.name}
            </button>
          ) : (
            <span className="text-gray-800 font-medium">{item.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
