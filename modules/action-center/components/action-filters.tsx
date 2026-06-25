"use client";

import { SearchIcon } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { ACTION_ITEM_PRIORITIES, ACTION_SOURCE_TYPES } from "../types/action-item.types";
import { SOURCE_LABELS } from "../constants/action-center.constants";

export interface FilterState {
  search: string;
  priority: string; // "" = all
  sourceType: string; // "" = all
}

interface ActionFiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

/** Контролируемая панель фильтров фида (search + priority + source). */
export function ActionFilters({ value, onChange }: ActionFiltersProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="relative flex-1">
        <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          label="Search"
          value={value.search}
          placeholder="Search actions…"
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          className="pl-9"
        />
      </div>
      <Select
        label="Priority"
        value={value.priority}
        onChange={(e) => onChange({ ...value, priority: e.target.value })}
        options={[{ value: "", label: "All priorities" }, ...ACTION_ITEM_PRIORITIES.map((p) => ({ value: p, label: p }))]}
      />
      <Select
        label="Source"
        value={value.sourceType}
        onChange={(e) => onChange({ ...value, sourceType: e.target.value })}
        options={[{ value: "", label: "All sources" }, ...ACTION_SOURCE_TYPES.map((s) => ({ value: s, label: SOURCE_LABELS[s] }))]}
      />
    </div>
  );
}
