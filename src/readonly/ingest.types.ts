/** Syntax inspection only: this result never authorizes semantic use or Apply. */
export type JsonInspectionIssue = {
  readonly code: 'INGEST_INPUT_TYPE' | 'INGEST_SIZE' | 'INGEST_SYNTAX' | 'INGEST_INTERNAL';
  readonly path: '';
  readonly message: string;
};

export type JsonTextInspection =
  | {
      readonly kind: 'syntax-valid';
      readonly rawText: string;
      readonly utf8Bytes: number;
      readonly semanticAdmission: 'NOT_EVALUATED';
    }
  | {
      readonly kind: 'rejected';
      readonly rawText: string | null;
      readonly utf8Bytes: number | null;
      readonly semanticAdmission: 'NOT_EVALUATED';
      readonly issue: JsonInspectionIssue;
    };
