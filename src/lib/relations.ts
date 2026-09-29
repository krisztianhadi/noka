/**
 * A contact's relation to the owner (D31). A fixed vocabulary, never free
 * text, so the responder page can render it in their own language.
 *
 * No formal standard exists for emergency relations — RFC 6350's RELATED
 * types describe a social graph, not family roles. This is the emergency-card
 * norm, gender-neutral, with `other` as the escape hatch.
 */
export const RELATIONS = ['spouse', 'partner', 'parent', 'sibling', 'child', 'friend', 'other'] as const;

export type Relation = (typeof RELATIONS)[number];

export function isRelation(value: string): value is Relation {
  return (RELATIONS as readonly string[]).includes(value);
}

export function relationMessageKey(relation: Relation): `relation.${Relation}` {
  return `relation.${relation}`;
}
