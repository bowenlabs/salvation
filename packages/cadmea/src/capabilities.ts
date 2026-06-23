/**
 * Drives action gating in `CollectionEdit` and the `tanstack-start` list/
 * edit page factories — hide/disable an action a context can't perform
 * rather than let it fail server-side after a click. A field left
 * `undefined` reads as "allowed", mirroring `@thebes/cadmus/cms`'s own
 * "no access fn configured = allowed" default, so collections that don't
 * wire this up at all keep today's unrestricted behavior.
 */
export interface CollectionCapabilities {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}
