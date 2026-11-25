import {
  CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, READ_WEB_PAGE, SAVE_WEB_PAGE, webPageCommandVersion,
} from '../../src/projects/web-page-repository.dto';
import type { CJob } from './c-test-policy';

export const WEB_PAGE_HTTP_SCOPE = 'C_WEB_PAGE_TEST_ONLY';
export const WEB_PAGE_HTTP_PATH = '/c-test/web-page/v1';
export const WEB_PAGE_WORKSPACE_HTTP_SCOPE = 'C_WEB_PAGE_WORKSPACE_TEST_ONLY';
export const WEB_PAGE_WORKSPACE_HTTP_PATH = '/c-test/web-page/v2';
export const WEB_PAGE_WORKSPACE_OUTPUT_BYTES = 32768;
const workspaceOperations = [CREATE_WEB_PAGE_PROJECT, LIST_WEB_PAGE_DOCUMENTS, SAVE_WEB_PAGE, READ_WEB_PAGE] as const;
export const WEB_PAGE_HTTP_OPERATIONS = ['create-project', SAVE_WEB_PAGE, READ_WEB_PAGE] as const;
export type CWebOperation = typeof WEB_PAGE_HTTP_OPERATIONS[number] | typeof workspaceOperations[number];
export const isCWebOperation = (op: unknown, workspace = false): op is CWebOperation =>
  (workspace ? workspaceOperations : WEB_PAGE_HTTP_OPERATIONS).some(candidate => op === candidate);
export const isCWebWrite = (op: CWebOperation) => op !== READ_WEB_PAGE && op !== LIST_WEB_PAGE_DOCUMENTS;
export const webDecoder = (op: CWebOperation) => op === 'create-project' ? null : webPageCommandVersion(op);

export function isCWebJob(operation: unknown, mode: unknown, workspace: boolean): boolean {
  return isCWebOperation(operation, workspace) && (mode === 'command' || mode === 'reconcile' && isCWebWrite(operation));
}

export const isCFault = (fault: unknown): fault is CJob['fault'] =>
  fault === 'none' || fault === 'spin' || fault === 'revoke-after-commit' || fault === 'before-web-commit';
