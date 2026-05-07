export type SessionFieldType = 'text' | 'email' | 'url' | 'textarea' | 'checkbox' | 'select' | 'file';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface SessionField {
  id: string;
  label: string;
  type: SessionFieldType;
  required: boolean;
  enabled: boolean;
  helpText?: string;
  placeholder?: string;
  options?: string[];   // for select
  linkText?: string;
  linkUrl?: string;
}

export interface FormConfig {
  id: string;
  title: string;
  description: string;
  fields: SessionField[];
  sessionCount: number;  // how many session options
  admins: string[];
  createdAt: number;
  publishedBlobId?: string;
  publishedBy?: string;
}

export interface Submission {
  id: string;
  formId: string;
  formBlobId: string;
  data: Record<string, string | string[] | boolean>;
  submitterAddress?: string;
  signature?: string;
  timestamp: number;
  blobId?: string;
  status: SubmissionStatus;
  adminNotes?: string;
}

// Walrus API response shape
export interface WalrusUploadResponse {
  blobId: string;
  objectId: string;
  endEpoch?: number;
}

// Re-export for legacy compat
export type { WalrusUploadResponse as WalrusResponse };
