"use client";

import { useState } from "react";

interface NewFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export function NewFolderDialog({ open, onClose, onConfirm }: NewFolderDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("폴더 이름을 입력하세요");
      return;
    }
    if (trimmed.length > 100) {
      setError("폴더 이름이 너무 깁니다");
      return;
    }
    onConfirm(trimmed);
    setName("");
    setError("");
  };

  const handleClose = () => {
    setName("");
    setError("");
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-surface-200 border border-border rounded-lg p-6 w-full max-w-sm shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-200 mb-4">새 폴더</h3>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="폴더 이름"
            autoFocus
            className="w-full px-3 py-2.5 bg-surface-300 border border-border rounded-md text-sm text-gray-200 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
          />
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-sm bg-brand text-white rounded-md hover:bg-brand/90 transition-colors"
            >
              생성
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
