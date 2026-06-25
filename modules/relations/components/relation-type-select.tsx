"use client";

import { Select } from "@/shared/ui/select";
import type { EntityLinkType } from "@/lib/entity-links";
import {
  MANUAL_RELATION_TYPES,
  RELATION_TYPE_LABELS,
} from "../constants/relation.constants";

interface RelationTypeSelectProps {
  value: EntityLinkType;
  onChange: (value: EntityLinkType) => void;
  label?: string;
  disabled?: boolean;
}

/** Выбор смысла связи из управляемого словаря MVP. */
export function RelationTypeSelect({
  value,
  onChange,
  label = "Relation type",
  disabled,
}: RelationTypeSelectProps) {
  return (
    <Select
      label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as EntityLinkType)}
      options={MANUAL_RELATION_TYPES.map((type) => ({
        value: type,
        label: RELATION_TYPE_LABELS[type],
      }))}
    />
  );
}
