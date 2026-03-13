import type { CampaignStatus } from "@/types/campaign";

interface Props {
  status: CampaignStatus | string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: "ATIVA",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
  PAUSED: {
    label: "PAUSADA",
    className: "bg-gray-100 text-gray-600 border border-gray-200",
  },
  DELETED: {
    label: "EXCLUÍDA",
    className: "bg-red-100 text-red-600 border border-red-200",
  },
  ARCHIVED: {
    label: "ARQUIVADA",
    className: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  },
};

export default function CampaignStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600 border border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${config.className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "ACTIVE" ? "bg-green-500" : "bg-gray-400"
        }`}
      />
      {config.label}
    </span>
  );
}
