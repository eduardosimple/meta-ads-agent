"use client";

interface Props {
  dateFrom: string;
  dateTo: string;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
}

export default function DateRangePicker({
  dateFrom,
  dateTo,
  onChangeFrom,
  onChangeTo,
}: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-sm text-gray-600 font-medium">Período:</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onChangeFrom(e.target.value)}
          max={dateTo}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700
                     focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                     bg-white"
        />
        <span className="text-gray-400 text-sm">até</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onChangeTo(e.target.value)}
          min={dateFrom}
          max={new Date().toISOString().split("T")[0]}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700
                     focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                     bg-white"
        />
      </div>
    </div>
  );
}
