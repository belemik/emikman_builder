import type { CapabilityAction, DefinitionDescriptor, DefinitionKind, DefinitionRef, EntityKind,
  GoalAssessment, ImmutableRevisionRef, MetadataCompatibility, ProjectCapabilityAssessment,
  ProjectDefinitionRegistryV1, ProjectDiagnostic, ProjectDiagnosticCode, ProjectEnvelopeAssessment,
  ProjectEnvelopeMetadataCandidate } from './envelope.types';
import { CAPABILITY_ACTIONS, MODEL_ID, MODEL_VERSION, PROJECT_DEFINITIONS,
  REGISTRY_ID, REGISTRY_VERSION } from './definitions';

const prefixes: ReadonlyMap<EntityKind, string> = new Map([
  ['project', 'prj'], ['work', 'wrk'], ['document', 'doc'], ['project-revision', 'prv'],
  ['document-revision', 'drv'], ['artifact', 'art'], ['source', 'src'],
  ['design-profile', 'dpf'], ['brand-profile', 'bpf'],
]);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** Shape only; never proves server issuance, object existence or authorization. */
export function hasEntityIdShape(value: string, kind: EntityKind): boolean {
  const prefix = prefixes.get(kind);
  return prefix !== undefined && value.length === prefix.length + 37
    && value.startsWith(prefix + '_') && uuidV4.test(value.slice(prefix.length + 1));
}
export function hasGoalIdShape(value: string): boolean {
  return /^goal-[1-9][0-9]*$/u.exec(value)?.[0] === value;
}
const noAdmission = { executionPermission: 'NOT_GRANTED', semanticAdmission: 'NOT_EVALUATED',
  trustedAdmission: 'NOT_IMPLEMENTED' } as const;
function diagnostic(code: ProjectDiagnosticCode, path: string, category: ProjectDiagnostic['category'],
  reason: string): ProjectDiagnostic {
  return { code, path, category, reason, alternatives: category === 'unknown'
    ? ['Keep the original metadata for inspection.', 'Select an explicitly supported exact definition/version.']
    : ['Keep the original metadata unchanged.', 'Review the indicated field or reference explicitly.'] };
}
function summary(issues: readonly ProjectDiagnostic[]): MetadataCompatibility {
  if (issues.some(d => d.category === 'unsupported')) return 'UNSUPPORTED';
  if (issues.some(d => d.category === 'unknown')) return 'UNKNOWN';
  if (issues.some(d => d.category === 'incomplete')) return 'INCOMPLETE';
  return 'RECOGNIZED';
}
function sameScalars(a: object, b: object): boolean {
  const entries = Object.entries(b);
  return Object.keys(a).length === entries.length && Object.entries(a).every(([key, value]) =>
    entries.some(([other, expected]) => key === other && value === expected));
}
function sameDescriptor(a: DefinitionDescriptor, b: DefinitionDescriptor): boolean {
  const { capabilities: ac, ...av } = a; const { capabilities: bc, ...bv } = b;
  return sameScalars(av, bv) && ac.length === bc.length && ac.every((v, i) => sameScalars(v, bc[i]));
}
/** Fixed-depth comparison of trusted registry data, not a decoder of arbitrary JS objects.
 * A changed snapshot cannot self-register under the approved id/version. An exact clone is fine.
 */
function isApprovedSnapshot(registry: ProjectDefinitionRegistryV1): boolean {
  const expected = PROJECT_DEFINITIONS;
  return Object.keys(registry).length === Object.keys(expected).length
    && registry.id === REGISTRY_ID && registry.version === REGISTRY_VERSION
    && (['products', 'targets', 'formats'] as const).every(key => registry[key].length === expected[key].length
      && registry[key].every((v, i) => sameDescriptor(v, expected[key][i])))
    && registry.goalTuples.length === expected.goalTuples.length
    && registry.goalTuples.every((v, i) => sameScalars(v, expected.goalTuples[i]));
}
function resolve(ref: DefinitionRef, kind: DefinitionKind, registry: ProjectDefinitionRegistryV1,
  ready: boolean): DefinitionDescriptor | undefined {
  if (!ready) return undefined;
  const list = kind === 'product' ? registry.products : kind === 'target' ? registry.targets : registry.formats;
  return list.find(d => d.kind === kind && d.id === ref.id && d.definitionVersion === ref.definitionVersion);
}
function capability(ref: DefinitionRef, action: CapabilityAction, registry: ProjectDefinitionRegistryV1,
  ready: boolean, path: string): ProjectCapabilityAssessment {
  const format = resolve(ref, 'format', registry, ready);
  const declaration = format?.capabilities.find(c => c.scope === 'project' && c.action === action);
  const availability = declaration?.availability ?? 'unknown';
  const reason = declaration?.reason ?? 'The exact format or approved registry snapshot is unknown.';
  return { ...noAdmission, action, scope: 'project', availability,
    evidenceRef: declaration?.evidenceRef ?? null, reason,
    format: { id: ref.id, definitionVersion: ref.definitionVersion },
    diagnostic: diagnostic(format ? 'PROJECT_CAPABILITY_UNSUPPORTED' : 'PROJECT_DEFINITION_UNKNOWN',
      path, format ? 'unsupported' : 'unknown', reason) };
}
/** Only Project scope. Legacy laboratory declarations never authorize Project operations. */
export function assessProjectCapability(ref: DefinitionRef, action: CapabilityAction,
  registry: ProjectDefinitionRegistryV1): ProjectCapabilityAssessment {
  return capability(ref, action, registry, isApprovedSnapshot(registry), '/capabilities/' + action);
}

/** Pure assessment of trusted metadata literals/fixtures only. No raw parser, admission,
 * source lookup, execution, persistence or arbitrary-object/getter/Proxy safety guarantee.
 */
export function assessProjectEnvelope(input: Readonly<ProjectEnvelopeMetadataCandidate>,
  registry: Readonly<ProjectDefinitionRegistryV1>): ProjectEnvelopeAssessment {
  const issues: ProjectDiagnostic[] = []; const goals: GoalAssessment[] = [];
  const add = (code: ProjectDiagnosticCode, path: string, category: ProjectDiagnostic['category'], reason: string) =>
    issues.push(diagnostic(code, path, category, reason));
  const id = (value: string, kind: EntityKind, path: string) => {
    if (!hasEntityIdShape(value, kind)) add('PROJECT_ID_SHAPE', path, 'unsupported', 'ID must have the exact lowercase entity prefix and UUIDv4 shape.');
  };
  const uniqueRefs = (values: readonly string[], kind: EntityKind, path: string) => {
    const seen = new Set<string>();
    values.forEach((value, i) => {
      id(value, kind, `${path}/${i}`);
      if (seen.has(value)) add('PROJECT_ID_DUPLICATE', `${path}/${i}`, 'unsupported', 'Duplicate identity reference.');
      seen.add(value);
    });
  };
  const seenRevisions = new Set<string>();
  const revision = (ref: ImmutableRevisionRef | null, kind: 'project' | 'document', path: string) => {
    if (ref === null) return; // Explicit pending metadata, not a fabricated saved version.
    const entityKind = kind === 'project' ? 'project-revision' : 'document-revision';
    id(ref.id, entityKind, path + '/id');
    if (ref.kind !== kind) add('PROJECT_REVISION_REF', path + '/kind', 'unsupported', 'Revision kind does not match its owning metadata entity.');
    if (seenRevisions.has(ref.id)) add('PROJECT_ID_DUPLICATE', path + '/id', 'unsupported', 'Current revision identity is reused by another entity.');
    seenRevisions.add(ref.id);
    if (ref.parentId !== null) {
      id(ref.parentId, entityKind, path + '/parentId');
      if (ref.parentId === ref.id) add('PROJECT_REVISION_REF', path + '/parentId', 'unsupported', 'Revision cannot be its own parent.');
    }
    if (ref.integrity === null) {
      add('PROJECT_REVISION_REF', path + '/integrity', 'incomplete', 'Declared revision has no integrity metadata; nothing is verified or persisted.');
    } else {
      const d = ref.integrity;
      if (d.algorithm !== 'sha256' || d.encoding !== 'hex-lower' || d.value.length !== 64
        || !/^[0-9a-f]{64}$/u.test(d.value) || !d.byteDomain.length
        || (kind === 'project' && d.byteDomain !== 'zarya.project-manifest.jcs/v1')) {
        add('PROJECT_REVISION_REF', path + '/integrity', 'unsupported', 'Integrity declaration has an invalid shape or project digest domain.');
      }
    }
    // No hash calculation, ancestry loading or Document context/domain approval in P01.
  };
  if (input.modelId !== MODEL_ID || input.modelVersion !== MODEL_VERSION)
    add('PROJECT_MODEL_VERSION', '/modelVersion', 'unknown', 'Unknown exact model identity/version; no migration or latest fallback.');
  const snapshotReady = isApprovedSnapshot(registry);
  if (!snapshotReady) add('PROJECT_REGISTRY_SNAPSHOT', '/registry', 'unknown', 'Registry data differs from the approved immutable metadata snapshot.');
  const registryReady = snapshotReady && input.registry.id === REGISTRY_ID && input.registry.version === REGISTRY_VERSION;
  if (input.registry.id !== REGISTRY_ID || input.registry.version !== REGISTRY_VERSION)
    add('PROJECT_REGISTRY_VERSION', '/registry', 'unknown', 'Unknown exact registry identity/version; dependent definition checks are unknown.');

  id(input.project.id, 'project', '/project/id');
  uniqueRefs(input.project.workIds, 'work', '/project/workIds');
  uniqueRefs(input.project.permittedSourceIds, 'source', '/project/permittedSourceIds');
  revision(input.project.currentRevisionRef, 'project', '/project/currentRevisionRef');
  if (input.project.defaultProductRef !== null && !resolve(input.project.defaultProductRef, 'product', registry, registryReady))
    add('PROJECT_DEFINITION_UNKNOWN', '/project/defaultProductRef', 'unknown', 'Unknown default product definition. A default is not an explicit Work goal.');
  const works = new Map<string, typeof input.works[number]>();
  const documents = new Map<string, typeof input.documents[number]>();
  input.works.forEach((work, i) => {
    const path = `/works/${i}`; id(work.id, 'work', path + '/id'); id(work.projectId, 'project', path + '/projectId');
    if (works.has(work.id)) add('PROJECT_ID_DUPLICATE', path + '/id', 'unsupported', 'Duplicate Work identity.');
    else works.set(work.id, work);
  });
  input.documents.forEach((doc, i) => {
    const path = `/documents/${i}`; id(doc.id, 'document', path + '/id');
    if (documents.has(doc.id)) add('PROJECT_ID_DUPLICATE', path + '/id', 'unsupported', 'Duplicate Document identity.');
    else documents.set(doc.id, doc);
  });
  input.project.workIds.forEach((ref, i) => {
    if (!works.has(ref)) add('PROJECT_REF_MISSING', `/project/workIds/${i}`, 'unsupported', 'Referenced Work metadata is absent.');
  });
  input.works.forEach((work, i) => {
    const path = `/works/${i}`;
    if (work.projectId !== input.project.id) add('PROJECT_REF_SCOPE', path + '/projectId', 'unsupported', 'Work belongs to a different Project identity.');
    if (!input.project.workIds.includes(work.id)) add('PROJECT_REF_MISSING', path + '/id', 'unsupported', 'Work is not listed by its Project.');
    uniqueRefs(work.documentIds, 'document', path + '/documentIds');
    work.documentIds.forEach((ref, j) => {
      const doc = documents.get(ref);
      if (!doc) add('PROJECT_REF_MISSING', `${path}/documentIds/${j}`, 'unsupported', 'Referenced Document metadata is absent.');
      else if (doc.workId !== work.id || doc.projectId !== input.project.id)
        add('PROJECT_REF_SCOPE', `${path}/documentIds/${j}`, 'unsupported', 'Document reference belongs to a different Work or Project.');
    });
    if (work.creationMode !== 'scratch' && work.creationMode !== 'redesign')
      add('PROJECT_MODE_UNSUPPORTED', path + '/creationMode', 'unsupported', 'Only scratch and redesign creation modes are defined.');
    if (work.redesignBaselineSourceId !== null) {
      id(work.redesignBaselineSourceId, 'source', path + '/redesignBaselineSourceId');
      if (!input.project.permittedSourceIds.includes(work.redesignBaselineSourceId))
        add('PROJECT_REF_MISSING', path + '/redesignBaselineSourceId', 'unsupported', 'Baseline identity is not among declared Project source references.');
    } else if (work.creationMode === 'redesign') {
      add('PROJECT_REDESIGN_BASELINE_MISSING', path + '/redesignBaselineSourceId', 'incomplete', 'Redesign requires an explicit baseline metadata reference; it would not prove source access or pinning.');
    }
    if (!work.goals.length) add('PROJECT_GOALS_MISSING', path + '/goals', 'incomplete', 'Work is a draft without explicit goals; defaults are not substituted.');
    const seenGoals = new Set<string>();
    work.goals.forEach((goal, j) => {
      const gp = `${path}/goals/${j}`;
      const local: ProjectDiagnostic[] = [];
      if (!hasGoalIdShape(goal.id)) local.push(diagnostic('PROJECT_ID_SHAPE', gp + '/id', 'unsupported', 'Goal identity must be Work-local goal-N, without zero or leading zeros.'));
      if (seenGoals.has(goal.id)) local.push(diagnostic('PROJECT_ID_DUPLICATE', gp + '/id', 'unsupported', 'Duplicate Work-local goal identity.'));
      seenGoals.add(goal.id);
      const product = resolve(goal.product, 'product', registry, registryReady);
      const target = resolve(goal.target, 'target', registry, registryReady);
      const format = resolve(goal.format, 'format', registry, registryReady);
      for (const [kind, descriptor] of [['product', product], ['target', target], ['format', format]] as const) {
        if (!descriptor) local.push(diagnostic('PROJECT_DEFINITION_UNKNOWN', gp + '/' + kind, 'unknown', 'Exact definition identity/version is unknown; no default is substituted.'));
      }
      let combinationCheck: GoalAssessment['combinationCheck'] = 'NOT_EVALUATED';
      if (product && target && format) {
        const known = format.role === 'goal' && registry.goalTuples.some(t =>
          t.productId === product.id && t.targetId === target.id && t.formatId === format.id);
        combinationCheck = known ? 'PASS' : 'FAIL';
        if (!known) local.push(diagnostic('PROJECT_COMBINATION_UNSUPPORTED', gp, 'unsupported', 'Known definitions do not form an approved metadata goal tuple.'));
      }
      issues.push(...local);
      goals.push({ workId: work.id, goalId: goal.id, path: gp, metadataCompatibility: summary(local),
        definitionChecks: { product: product ? 'PASS' : 'UNKNOWN', target: target ? 'PASS' : 'UNKNOWN', format: format ? 'PASS' : 'UNKNOWN' },
        combinationCheck, capabilities: CAPABILITY_ACTIONS.map(action => capability(goal.format, action, registry, registryReady, gp + '/capabilities/' + action)) });
    });
  });
  input.documents.forEach((doc, i) => {
    const path = `/documents/${i}`;
    id(doc.projectId, 'project', path + '/projectId'); id(doc.workId, 'work', path + '/workId');
    if (doc.projectId !== input.project.id) add('PROJECT_REF_SCOPE', path + '/projectId', 'unsupported', 'Document belongs to a different Project.');
    revision(doc.revisionRef, 'document', path + '/revisionRef');
    if (!hasGoalIdShape(doc.goalId)) add('PROJECT_ID_SHAPE', path + '/goalId', 'unsupported', 'Invalid Work-local goal reference.');
    if (!resolve(doc.format, 'format', registry, registryReady))
      add('PROJECT_DEFINITION_UNKNOWN', path + '/format', 'unknown', 'Exact Document format identity/version is unknown.');
    const work = works.get(doc.workId);
    if (!work) add('PROJECT_REF_MISSING', path + '/workId', 'unsupported', 'Document parent Work metadata is absent.');
    else {
      if (!work.documentIds.includes(doc.id)) add('PROJECT_REF_MISSING', path + '/id', 'unsupported', 'Document is not listed by its parent Work.');
      const goal = work.goals.find(g => g.id === doc.goalId);
      if (!goal) add('PROJECT_REF_MISSING', path + '/goalId', 'unsupported', 'Document goal is absent from its parent Work.');
      else if (doc.format.id !== goal.format.id || doc.format.definitionVersion !== goal.format.definitionVersion)
        add('PROJECT_FORMAT_MISMATCH', path + '/format', 'unsupported', 'Document format must match its explicit parent goal exactly.');
    }
  });
  return { ...noAdmission, scope: 'P01_METADATA_ONLY', metadataCompatibility: summary(issues),
    diagnostics: issues, goals, sourceResolution: 'NOT_EVALUATED', apply: 'UNSUPPORTED' };
}
