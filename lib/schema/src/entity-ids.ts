import type { EntityId } from "./types.ts";

const entityIdPattern = /^entity_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isEntityId(value: unknown): value is EntityId {
  return typeof value === "string" && entityIdPattern.test(value);
}

export function parseEntityId(context: string, value: unknown): EntityId {
  if (!isEntityId(value)) {
    throw new Error(`${context} must use "entity_<lowercase-uuid>" format.`);
  }

  return value;
}
