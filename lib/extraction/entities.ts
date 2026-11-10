export type ExtractedEntity = {
  id: string;
  canonical_name: string;
  entity_type: string;
  clearance: number;
};

export type StoredEntity = ExtractedEntity;

export function reconcileExtractedEntities(incoming: ExtractedEntity[], stored: StoredEntity[]) {
  const keyOf = (entity: Pick<ExtractedEntity, 'canonical_name' | 'entity_type'>) =>
    `${entity.entity_type.normalize('NFKC').trim().toLocaleLowerCase('en-US')}\u0000${entity.canonical_name.normalize('NFKC').trim().toLocaleLowerCase('en-US')}`;

  const storedByKey = new Map(stored.map((entity) => [keyOf(entity), entity]));
  const insertedByKey = new Map<string, ExtractedEntity>();
  const incomingToStoredId = new Map<string, string>();
  const clearanceByStoredId = new Map<string, number>();
  const entitiesToInsert: ExtractedEntity[] = [];

  for (const entity of incoming) {
    const key = keyOf(entity);
    const existing = storedByKey.get(key);
    if (existing) {
      incomingToStoredId.set(entity.id, existing.id);
      clearanceByStoredId.set(existing.id, Math.max(clearanceByStoredId.get(existing.id) ?? existing.clearance, entity.clearance));
      continue;
    }

    const alreadyQueued = insertedByKey.get(key);
    if (alreadyQueued) {
      incomingToStoredId.set(entity.id, alreadyQueued.id);
      alreadyQueued.clearance = Math.max(alreadyQueued.clearance, entity.clearance);
      continue;
    }

    const queued = { ...entity };
    insertedByKey.set(key, queued);
    entitiesToInsert.push(queued);
    incomingToStoredId.set(entity.id, entity.id);
  }

  const clearanceUpdates = stored.flatMap((entity) => {
    const clearance = clearanceByStoredId.get(entity.id);
    return clearance !== undefined && clearance > entity.clearance ? [{ id: entity.id, clearance }] : [];
  });

  return { incomingToStoredId, entitiesToInsert, clearanceUpdates };
}
