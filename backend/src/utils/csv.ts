function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))].join("\n") + "\n";
}

export function csvHeaders(filename: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}
