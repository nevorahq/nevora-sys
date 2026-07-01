"use client";

import { Select } from "@/shared/ui/select";
import type { EntityLinkType } from "@/lib/entity-links";
import { RELATION_TYPE_LABELS } from "../constants/relation.constants";

interface RelationTypeSelectProps {
  value: EntityLinkType;
  onChange: (value: EntityLinkType) => void;
  /** Relation types доступные для выбранной пары entity types (fail-closed вызывающей стороной). */
  options: EntityLinkType[];
  label?: string;
  disabled?: boolean;
}

/** Выбор смысла связи, ограниченный опциями для конкретной пары entity types. */
export function RelationTypeSelect({
  value,
  onChange,
  options,
  label = "Relation type",
  disabled,
}: RelationTypeSelectProps) {
  return (
    <Select
      label={label}
      value={value}
      disabled={disabled || options.length === 0}
      onChange={(e) => onChange(e.target.value as EntityLinkType)}
      options={options.map((type) => ({
        value: type,
        label: RELATION_TYPE_LABELS[type],
      }))}
    />
  );
}
