"use client";

interface ValidationFlagProps {
  severity: "error" | "warning" | "info";
  message: string;
}

const SEVERITY_STYLES = {
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

const SEVERITY_ICONS = {
  error: "!",
  warning: "?",
  info: "i",
};

export function ValidationFlag({ severity, message }: ValidationFlagProps) {
  return (
    <div
      className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${SEVERITY_STYLES[severity]}`}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-xs font-bold">
        {SEVERITY_ICONS[severity]}
      </span>
      <span>{message}</span>
    </div>
  );
}
