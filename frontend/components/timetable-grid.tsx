"use client";

import type { Timetable, TimetableSlot } from "@/lib/types";
import { DAY_NAMES } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function TimetableGrid({
  timetable,
  onSlotClick,
}: {
  timetable: Timetable;
  onSlotClick?: (slot: TimetableSlot) => void;
}) {
  const maxPeriod = Math.max(...timetable.slots.map((s) => s.period), 0);
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);
  const grid: (typeof timetable.slots[number] | null)[][] = DAY_NAMES.map(() => periods.map(() => null));
  for (const slot of timetable.slots) {
    if (grid[slot.day] && grid[slot.day][slot.period - 1] !== undefined) {
      grid[slot.day][slot.period - 1] = slot;
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{timetable.branch}</span>
        <span>Semester {timetable.semester}</span>
        {timetable.section && <span>Section {timetable.section}</span>}
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-border bg-muted/50 px-2 py-2 text-left font-medium text-muted-foreground">Period</th>
            {DAY_NAMES.map((d) => (
              <th key={d} className="border border-border bg-muted/50 px-2 py-2 text-left font-medium">
                {d.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <td className="border border-border bg-muted/30 px-2 py-2 font-medium text-muted-foreground">{p}</td>
              {DAY_NAMES.map((_, di) => {
                const slot = grid[di][p - 1];
                return (
                  <td key={di} className="border border-border/80 px-2 py-1.5 align-top">
                    {slot ? (
                      <button
                        type="button"
                        disabled={!onSlotClick}
                        onClick={() => onSlotClick?.(slot)}
                        className={cn(
                          "w-full rounded-md bg-primary/10 px-2 py-1 text-left ring-1 ring-inset ring-primary/25 transition-colors",
                          onSlotClick && "cursor-pointer hover:bg-primary/20",
                        )}
                      >
                        <div className="font-semibold text-primary">{slot.course}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {[slot.code, slot.room, slot.faculty].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                    ) : (
                      <div className={cn("h-8")} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
