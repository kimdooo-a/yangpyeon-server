"use client";

import { useState } from "react";
import { IconFolder } from "@/components/ui/icons";

interface FolderItem {
  id: string;
  name: string;
  createdAt: string;
}

interface FolderListProps {
  folders: FolderItem[];
  onNavigate: (folderId: string) => void;
  onRename: (folderId: string, currentName: string) => void;
  onDelete: (folderId: string, name: string) => void;
}

export function FolderList({ folders, onNavigate, onRename, onDelete }: FolderListProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  if (folders.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="group flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-surface-300 transition-colors cursor-pointer"
          onClick={() => onNavigate(folder.id)}
        >
          <IconFolder className="text-yellow-500 shrink-0" size={20} />
          <span className="text-sm text-gray-800 flex-1 truncate">{folder.name}</span>
          <span className="text-xs text-gray-400 hidden sm:block">
            {new Date(folder.createdAt).toLocaleDateString("ko")}
          </span>

          {/* 컨텍스트 메뉴 */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(menuOpen === folder.id ? null : folder.id);
              }}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-surface-400 opacity-0 group-hover:opacity-100 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen === folder.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                <div className="absolute right-0 top-8 z-20 bg-surface-300 border border-border rounded-md shadow-lg py-1 min-w-[120px]">
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-surface-400"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(null); onRename(folder.id, folder.name); }}
                  >
                    이름 변경
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-surface-400"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(null); onDelete(folder.id, folder.name); }}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
