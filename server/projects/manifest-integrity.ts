import { createHash, timingSafeEqual } from 'node:crypto';
import { canonicalizeProjectManifest } from '../../src/projects/canonicalize-project';
import type { TrustedOwnedJcsData } from '../../src/projects/canonicalization.types';
import type { DeclaredIntegrity } from '../../src/projects/envelope.types';
const domain='zarya.project-manifest.jcs/v1';
/** Platform SHA only. Domain is fixed, no IO/clock/RNG. Reuses the approved S1b wrapper.
 * Caller-owned internal data only; not a decoder, admission or authentication proof. */
export function computeManifestIntegrity(manifest: TrustedOwnedJcsData) {
  const result=canonicalizeProjectManifest(manifest);
  if (result.kind!=='canonicalized') return result;
  const value=createHash('sha256').update(domain,'ascii').update(Buffer.from([0]))
    .update(result.canonicalText,'utf8').digest('hex');
  const integrity: DeclaredIntegrity=Object.freeze({algorithm:'sha256',encoding:'hex-lower',byteDomain:domain,value});
  return Object.freeze({...result,kind:'manifest-integrity' as const,integrity});
}
/** Declaration must exactly match computed domain and bytes. A correct digest grants no access. */
export function verifyManifestIntegrity(manifest: TrustedOwnedJcsData, declared: DeclaredIntegrity) {
  const result=computeManifestIntegrity(manifest);
  if(result.kind==='canonicalization-error') return result;
  if(declared.algorithm!=='sha256'||declared.encoding!=='hex-lower'||declared.byteDomain!==domain
    ||typeof declared.value!=='string'||declared.value.length!==64||!/^[0-9a-f]{64}$/.test(declared.value)
    || !timingSafeEqual(Buffer.from(declared.value,'hex'),Buffer.from(result.integrity.value,'hex'))) {
    return Object.freeze({kind:'integrity-error' as const,code:'MANIFEST_DIGEST_MISMATCH' as const,
      executionPermission:'NOT_GRANTED' as const,persistencePermission:'NOT_GRANTED' as const,
      semanticAdmission:'NOT_EVALUATED' as const,trustedAdmission:'NOT_IMPLEMENTED' as const});
  }
  return Object.freeze({...result,kind:'integrity-verified' as const});
}
