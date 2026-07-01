"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SearchIcon, CheckIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Select } from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import type { EntityLinkType } from "@/lib/entity-links";
import {
  RELATION_ENTITY_KINDS,
  ENTITY_KIND_SINGULAR,
} from "../constants/relation.constants";
import type { EntityKind, RelationCandidate } from "../types/relation.types";
import { searchRelationCandidates } from "../actions/search-relation-candidates.action";
import { createEntityRelation } from "../actions/create-relation.action";
import { getRelationTypeOptionsForPair } from "../utils/relation-type-options";
import { RelationTypeSelect } from "./relation-type-select";

interface RelationSearchDialogProps {
  sourceEntityType: EntityKind;
  sourceEntityId: string;
  /** Путь для revalidate после создания (detail-страница). */
  revalidate?: string;
  /** Стиль кнопки-триггера. */
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerLabel?: string;
}

/**
 * RelationSearchDialog — UX связывания:
 * выбрать тип → найти сущность → выбрать → выбрать тип связи → подтвердить.
 *
 * Tenant-safe: поиск и создание идут через server actions, organization_id
 * резолвится на сервере. После успеха — router.refresh() (+ revalidatePath
 * в action), чтобы viewer обновился.
 */
export function RelationSearchDialog({
  sourceEntityType,
  sourceEntityId,
  revalidate,
  triggerVariant = "secondary",
  triggerLabel = "Add link",
}: RelationSearchDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [targetType, setTargetType] = useState<EntityKind>(
    sourceEntityType === "document" ? "task" : "document",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RelationCandidate[]>([]);
  const [selected, setSelected] = useState<RelationCandidate | null>(null);
  const [relationType, setRelationType] = useState<EntityLinkType>("related_to");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Опции relation type, осмысленные для выбранной пары (source ↔ target).
  const relationTypeOptions = useMemo(
    () => getRelationTypeOptionsForPair(sourceEntityType, targetType),
    [sourceEntityType, targetType],
  );

  function selectTargetType(next: EntityKind) {
    setTargetType(next);
    setSelected(null);
    const nextOptions = getRelationTypeOptionsForPair(sourceEntityType, next);
    if (!nextOptions.includes(relationType)) {
      setRelationType(nextOptions[0] ?? "related_to");
    }
  }

  // Поиск с дебаунсом при открытой модалке / смене типа / запроса.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const handle = setTimeout(async () => {
      setSearching(true);
      const res = await searchRelationCandidates({
        targetTypes: [targetType],
        query,
        excludeId: targetType === sourceEntityType ? sourceEntityId : undefined,
      });
      if (!active) return;
      if (res.ok) setResults(res.data);
      else setError(res.error);
      setSearching(false);
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [isOpen, targetType, query, sourceEntityType, sourceEntityId]);

  function reset() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setRelationType("related_to");
    setError(null);
  }

  function close() {
    setIsOpen(false);
    reset();
  }

  function confirm() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await createEntityRelation(
        {
          sourceEntityType,
          sourceEntityId,
          targetEntityType: selected.type,
          targetEntityId: selected.id,
          relationType,
        },
        revalidate,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      close();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm"
      >
        <PlusIcon size={15} />
        {triggerLabel}
      </Button>

      <Modal isOpen={isOpen} onClose={close} title="Link an entity">
        <div className="space-y-4">
          <Select
            label="Entity type"
            value={targetType}
            onChange={(e) => selectTargetType(e.target.value as EntityKind)}
            options={RELATION_ENTITY_KINDS.map((kind) => ({
              value: kind,
              label: ENTITY_KIND_SINGULAR[kind],
            }))}
          />

          <div>
            <div className="relative">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Input
                label="Search"
                value={query}
                placeholder={`Search ${ENTITY_KIND_SINGULAR[targetType].toLowerCase()}…`}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {searching && (
                <p className="px-1 py-2 text-sm text-text-muted">Searching…</p>
              )}
              {!searching && results.length === 0 && (
                <p className="px-1 py-2 text-sm text-text-muted">No matches found.</p>
              )}
              {results.map((candidate) => {
                const isSelected =
                  selected?.id === candidate.id && selected?.type === candidate.type;
                return (
                  <button
                    key={`${candidate.type}:${candidate.id}`}
                    type="button"
                    onClick={() => setSelected(candidate)}
                    className={`flex w-full items-center justify-between gap-2 rounded-(--neu-radius) px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-accent-blue-soft text-text-primary"
                        : "hover:bg-surface-sunken text-text-secondary"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text-primary">
                        {candidate.title}
                      </span>
                      {candidate.subtitle && (
                        <span className="block truncate text-xs text-text-muted">
                          {candidate.subtitle}
                        </span>
                      )}
                    </span>
                    {isSelected && <CheckIcon size={16} className="shrink-0 text-accent-blue" />}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <RelationTypeSelect
              value={relationType}
              onChange={setRelationType}
              options={relationTypeOptions}
            />
          )}

          {error && <p className="text-sm text-accent-pink">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={!selected || isPending || relationTypeOptions.length === 0}
              isLoading={isPending}
            >
              Create link
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
