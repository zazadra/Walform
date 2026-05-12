export type SessionFieldType = 'text' | 'email' | 'url' | 'textarea' | 'checkbox' | 'select' | 'file' | 'rating';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface SessionField {
  id: string;
  label: string;
  type: SessionFieldType;
  required: boolean;
  enabled: boolean;
  helpText?: string;
  description?: string; // field-level description shown below label
  placeholder?: string;
  options?: string[];   // for select
  linkText?: string;
  linkUrl?: string;
}

export interface FormConfig {
  type?: 'form'; // Discriminator for Walrus blob scanning
  id: string;
  title: string;
  description: string;
  fields: SessionField[];
  sessionCount: number;  // how many session options
  admins: string[];
  createdAt: number;
  publishedBlobId?: string;
  publishedSuiObjectId?: string; // Sui Form object ID (used as formId in /f/?formId=)
  publishedBy?: string; // ownerWallet
  encryptionEnabled?: boolean; // Seal encryption flag
}

export interface Submission {
  type?: 'submission'; // Discriminator for Walrus blob scanning
  id: string;
  formId: string;
  formBlobId: string;
  parentFormBlobId?: string; // Explicit parent link
  data: Record<string, string | string[] | boolean>;
  submitterAddress?: string;
  signature?: string;
  timestamp: number;
  blobId?: string;
  status: string;
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
