import { useState } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}

export default function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  label = "bản ghi",
}: PaginationProps) {
  const [goToInput, setGoToInput] = useState("");

  if (totalPages <= 1) return null;

  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, i) => {
      if (totalPages <= 5) return i + 1;
      if (page <= 3) return i + 1;
      if (page >= totalPages - 2) return totalPages - 4 + i;
      return page - 2 + i;
    },
  );

  function handleGoTo() {
    const p = parseInt(goToInput);
    if (p >= 1 && p <= totalPages) {
      onPageChange(p);
      setGoToInput("");
    }
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-2">
      <p className="text-sm text-gray-500">
        Trang {page}/{totalPages} — {total.toLocaleString()} {label}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ««
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹ Trước
        </button>
        {pageNumbers.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1 text-xs rounded border ${
              p === page
                ? "bg-primary-600 text-white border-primary-600"
                : "border-gray-200 hover:bg-white"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sau ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          »»
        </button>
        <span className="text-gray-300 mx-1">|</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={goToInput}
          onChange={(e) => setGoToInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGoTo()}
          placeholder="Trang..."
          className="w-16 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 focus:border-transparent"
        />
        <button
          onClick={handleGoTo}
          className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-white"
        >
          Đi
        </button>
      </div>
    </div>
  );
}
