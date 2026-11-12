import type { NoExecutionAdmission } from './envelope.types';

/** Internal caller-owned, bounded, acyclic plain data ONLY. Readonly is not proof of
 * ownership. No Proxy, accessors, custom prototypes/serializers or concurrent aliases.
 * This is not a decoder, network-input type or Trusted Admission constructor. */
export type TrustedOwnedJcsData = null | boolean | number | string
  | readonly TrustedOwnedJcsData[] | { readonly [key: string]: TrustedOwnedJcsData };

/** Exact metadata-only CF-01 shape. Strings/number still require the wrapper's checks.
 * Empty regions are explicit; this type does not establish provenance or authority. */
export type CanonicalProjectManifestV1 = {
  readonly modelId: 'zarya.project-envelope';
  readonly modelVersion: '1.0.0';
  readonly canonicalizationProfile: 'zarya.project-manifest.jcs/v1';
  readonly projectId: string;
  readonly revision: {
    readonly id: string;
    readonly parentId: string | null;
    readonly sequence: number;
    readonly createdAt: string;
    readonly actorRef: string;
    readonly restoreOf: string | null;
  };
  readonly content: {
    readonly metadata: {
      readonly name: string;
      readonly description: string;
      readonly defaultProjectType: { readonly id: string; readonly definitionVersion: string } | null;
    };
    readonly permittedSourceRefs: readonly [];
    readonly designDefaultsRef: null;
    readonly works: readonly [];
    readonly documentHeads: readonly [];
  };
};
export type CanonicalizationScope = 'JCS_DATA_ONLY' | 'PROJECT_MANIFEST_METADATA_ONLY';
export type CanonicalizationDiagnosticCode = 'S1B_DATA_SHAPE' | 'S1B_UNICODE'
  | 'S1B_NUMBER' | 'S1B_CYCLE' | 'S1B_MISSING_FIELD' | 'S1B_UNKNOWN_FIELD'
  | 'S1B_VERSION' | 'S1B_ID' | 'S1B_TIMESTAMP' | 'S1B_LINEAGE'
  | 'S1B_DEFINITION' | 'S1B_UNSUPPORTED_REGION';
export type CanonicalizationDiagnostic = {
  readonly code: CanonicalizationDiagnosticCode;
  /** Schema path or generic array index; never includes an untrusted property name/value. */
  readonly path: string;
  readonly reason: string;
};
type Restrictions = NoExecutionAdmission & { readonly persistencePermission: 'NOT_GRANTED' };
export type CanonicalizationFailure<S extends CanonicalizationScope> = Restrictions & {
  readonly kind: 'canonicalization-error';
  readonly scope: S;
  readonly diagnostics: readonly CanonicalizationDiagnostic[];
};
export type JcsCanonicalizationResult = CanonicalizationFailure<'JCS_DATA_ONLY'> | (Restrictions & {
  readonly kind: 'canonicalized';
  readonly scope: 'JCS_DATA_ONLY';
  readonly canonicalText: string;
});
export type ProjectCanonicalizationResult = CanonicalizationFailure<'PROJECT_MANIFEST_METADATA_ONLY'> | (Restrictions & {
  readonly kind: 'canonicalized';
  readonly scope: 'PROJECT_MANIFEST_METADATA_ONLY';
  readonly canonicalizationProfile: 'zarya.project-manifest.jcs/v1';
  readonly canonicalText: string;
});
