/** P01 metadata only. None of these types authenticate data or grant execution. */
export type CreationMode = 'scratch' | 'redesign';
export type EntityKind = 'project' | 'work' | 'document' | 'project-revision'
  | 'document-revision' | 'artifact' | 'source' | 'design-profile' | 'brand-profile';
export interface DefinitionRef { readonly id: string; readonly definitionVersion: string }
export interface DeclaredIntegrity {
  readonly algorithm: 'sha256';
  readonly encoding: 'hex-lower';
  readonly byteDomain: string;
  readonly value: string;
}
/** A declaration, never verified bytes, persisted history or an integrity calculation. */
export type ImmutableRevisionRef = {
  readonly kind: 'project' | 'document';
  readonly id: string;
  readonly parentId: string | null;
  readonly integrity: DeclaredIntegrity | null;
};
export interface ProjectEnvelopeV1 {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** P01 name for conceptual defaultProjectType. Never fills an absent goal. */
  readonly defaultProductRef: DefinitionRef | null;
  /** Declared source identities; not access permissions or resolved source versions. */
  readonly permittedSourceIds: readonly string[];
  readonly workIds: readonly string[];
  readonly currentRevisionRef: ImmutableRevisionRef | null;
}
export interface Goal {
  readonly id: string;
  readonly product: DefinitionRef;
  readonly target: DefinitionRef;
  readonly format: DefinitionRef;
}
export interface WorkEnvelopeV1 {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly creationMode: CreationMode;
  /** Identity-only metadata. Existence, version, permission and availability NOT evaluated. */
  readonly redesignBaselineSourceId: string | null;
  readonly goals: readonly Goal[];
  readonly documentIds: readonly string[];
}
export interface DocumentEnvelopeV1 {
  readonly id: string;
  readonly projectId: string;
  readonly workId: string;
  readonly name: string;
  readonly goalId: string;
  readonly format: DefinitionRef;
  readonly revisionRef: ImmutableRevisionRef | null;
}
export interface NeutralProjectEnvelopeV1 {
  readonly modelId: 'zarya.project-envelope';
  readonly modelVersion: '1.0.0';
  readonly registry: { readonly id: 'zarya.project-definitions'; readonly version: '1.1.0-draft.1' };
  readonly project: ProjectEnvelopeV1;
  readonly works: readonly WorkEnvelopeV1[];
  readonly documents: readonly DocumentEnvelopeV1[];
}
/** Trusted internal literals/fixtures ONLY. Unknown version strings are diagnostic inputs.
 * Not an unknown-object boundary: arbitrary objects, getters and Proxy are outside this API.
 */
export interface ProjectEnvelopeMetadataCandidate {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly registry: { readonly id: string; readonly version: string };
  readonly project: ProjectEnvelopeV1;
  readonly works: readonly WorkEnvelopeV1[];
  readonly documents: readonly DocumentEnvelopeV1[];
}
export type CapabilityAction = 'preview' | 'render' | 'validate' | 'export'
  | 'apply' | 'analyze' | 'generate' | 'edit';
export interface CapabilityDeclaration {
  readonly action: CapabilityAction;
  readonly scope: 'legacy-laboratory' | 'project';
  readonly availability: 'partial' | 'unsupported' | 'unknown';
  readonly evidenceRef: string | null;
  readonly reason: string;
}
export type DefinitionKind = 'product' | 'target' | 'format';
export interface DefinitionDescriptor extends DefinitionRef {
  readonly kind: DefinitionKind;
  readonly label: string;
  readonly role: 'goal' | 'derived-report' | 'reference' | null;
  readonly placeholder: boolean;
  readonly capabilities: readonly CapabilityDeclaration[];
}
export interface GoalTuple {
  readonly productId: string;
  readonly targetId: string;
  readonly formatId: string;
}
export interface ProjectDefinitionRegistryV1 {
  readonly id: 'zarya.project-definitions';
  readonly version: '1.1.0-draft.1';
  readonly products: readonly DefinitionDescriptor[];
  readonly targets: readonly DefinitionDescriptor[];
  readonly formats: readonly DefinitionDescriptor[];
  readonly goalTuples: readonly GoalTuple[];
}
export type MetadataCompatibility = 'RECOGNIZED' | 'UNSUPPORTED' | 'UNKNOWN' | 'INCOMPLETE';
export type ProjectDiagnosticCode = 'PROJECT_MODEL_VERSION' | 'PROJECT_REGISTRY_VERSION'
  | 'PROJECT_REGISTRY_SNAPSHOT' | 'PROJECT_ID_SHAPE' | 'PROJECT_ID_DUPLICATE'
  | 'PROJECT_REF_MISSING' | 'PROJECT_REF_SCOPE' | 'PROJECT_DEFINITION_UNKNOWN'
  | 'PROJECT_COMBINATION_UNSUPPORTED' | 'PROJECT_REDESIGN_BASELINE_MISSING'
  | 'PROJECT_GOALS_MISSING' | 'PROJECT_MODE_UNSUPPORTED' | 'PROJECT_FORMAT_MISMATCH'
  | 'PROJECT_REVISION_REF' | 'PROJECT_CAPABILITY_UNSUPPORTED';
export interface ProjectDiagnostic {
  readonly code: ProjectDiagnosticCode;
  readonly path: string;
  readonly category: 'unsupported' | 'unknown' | 'incomplete';
  readonly reason: string;
  readonly alternatives: readonly string[];
}
export interface NoExecutionAdmission {
  readonly executionPermission: 'NOT_GRANTED';
  readonly semanticAdmission: 'NOT_EVALUATED';
  readonly trustedAdmission: 'NOT_IMPLEMENTED';
}
export interface ProjectCapabilityAssessment extends CapabilityDeclaration, NoExecutionAdmission {
  readonly scope: 'project';
  readonly format: DefinitionRef;
  readonly diagnostic: ProjectDiagnostic;
}
export interface GoalAssessment {
  readonly workId: string;
  readonly goalId: string;
  readonly path: string;
  readonly metadataCompatibility: MetadataCompatibility;
  readonly definitionChecks: Readonly<Record<DefinitionKind, 'PASS' | 'UNKNOWN'>>;
  readonly combinationCheck: 'PASS' | 'FAIL' | 'NOT_EVALUATED';
  readonly capabilities: readonly ProjectCapabilityAssessment[];
}
export interface ProjectEnvelopeAssessment extends NoExecutionAdmission {
  readonly scope: 'P01_METADATA_ONLY';
  readonly metadataCompatibility: MetadataCompatibility;
  readonly diagnostics: readonly ProjectDiagnostic[];
  readonly goals: readonly GoalAssessment[];
  readonly sourceResolution: 'NOT_EVALUATED';
  readonly apply: 'UNSUPPORTED';
}
