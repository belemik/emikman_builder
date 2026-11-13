import { randomUUID } from 'node:crypto';
import { hasEntityIdShape } from '../../src/projects/compatibility';
import type { EntityKind } from '../../src/projects/envelope.types';
const prefixes: Readonly<Record<EntityKind, string>> = Object.freeze({ project:'prj', work:'wrk', document:'doc',
  'project-revision':'prv', 'document-revision':'drv', artifact:'art', source:'src', 'design-profile':'dpf', 'brand-profile':'bpf' });
export class ServerIdentityError extends Error {
  constructor(readonly code:'ID_KIND_UNSUPPORTED'|'ID_SOURCE_INVALID'|'ID_SOURCE_UNAVAILABLE'|'ID_ALLOCATION_COLLISION'){super(code);}
}
/** Effectful issuance; not a verified principal/authorization factory. The DB must also enforce
 * uniqueness across issuers/restarts. Optional RNG is a trusted test seam, never metadata. */
export function createServerIdIssuer(uuid: () => string = randomUUID) {
  const allocated = new Set<string>();
  return Object.freeze({ next(kind: EntityKind): string {
    if (!Object.hasOwn(prefixes,kind)) throw new ServerIdentityError('ID_KIND_UNSUPPORTED');
    for (let attempt=0;attempt<8;attempt++) {
      let suffix:string;try{suffix=uuid();}catch{throw new ServerIdentityError('ID_SOURCE_UNAVAILABLE');}
      const id=prefixes[kind]+'_'+suffix;
      if (!hasEntityIdShape(id,kind)) throw new ServerIdentityError('ID_SOURCE_INVALID');
      if (!allocated.has(id)) { allocated.add(id);return id; }
    }
    throw new ServerIdentityError('ID_ALLOCATION_COLLISION');
  } });
}
