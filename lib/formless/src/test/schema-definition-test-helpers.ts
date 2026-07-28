export function setKeyedDefinition<Definition extends { key: string }>(
  definitions: Definition[],
  key: string,
  definition: Omit<Definition, "key"> | Definition,
): void {
  const value = { ...definition, key } as Definition;
  const index = definitions.findIndex((candidate) => candidate.key === key);
  if (index === -1) {
    definitions.push(value);
    return;
  }
  definitions.splice(index, 1, value);
}

export function setFieldDefinition<Definition extends { field: string }>(
  definitions: Definition[],
  field: string,
  definition: Omit<Definition, "field"> | Definition,
): void {
  const value = { ...definition, field } as Definition;
  const index = definitions.findIndex((candidate) => candidate.field === field);
  if (index === -1) {
    definitions.push(value);
    return;
  }
  definitions.splice(index, 1, value);
}
