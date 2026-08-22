"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY = "__empty__";

export function FormSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  id,
  size = "default",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  id?: string;
  size?: "sm" | "default";
}) {
  const items = options.map((o) => ({
    value: o.value === "" ? EMPTY : o.value,
    label: o.label,
  }));
  const selected = value === "" ? EMPTY : value;
  const known = items.some((o) => o.value === selected);

  return (
    <Select
      value={known ? selected : null}
      onValueChange={(next) => onValueChange(!next || next === EMPTY ? "" : next)}
      modal={false}
    >
      <SelectTrigger id={id} size={size} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
