// Re-export from the new walform types for backwards compat
export type { WalrusUploadResponse } from './walform';
export type { Submission, SubmissionStatus, FormConfig, SessionField, SessionFieldType } from './walform';

// Legacy types kept for any old code that hasn't been removed yet
export interface WalrusResponse { blobId: string; objectId: string; endEpoch?: number; }
