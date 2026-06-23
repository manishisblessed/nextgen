// ---------------------------------------------------------------------------
// Same Day Solution — POS Partner API types
// Matched to ACTUAL API response shapes (verified against live endpoints)
// ---------------------------------------------------------------------------

export type PosTransactionStatus =
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "REFUNDED"
  | "VOIDED";

export type PosPaymentMode =
  | "CARD"
  | "UPI"
  | "NFC"
  | "CASH"
  | "WALLET"
  | "NETBANKING"
  | "BHARATQR";

export type PosMachineStatus =
  | "active"
  | "inactive"
  | "maintenance"
  | "decommissioned";

export type PosExportFormat = "csv" | "excel" | "pdf" | "zip";

export type PosExportJobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

// ── Request types ──

export interface PosTransactionsRequest {
  date_from: string;
  date_to: string;
  status?: PosTransactionStatus | null;
  terminal_id?: string | null;
  payment_mode?: PosPaymentMode | null;
  page?: number;
  page_size?: number;
}

export interface PosMachinesQuery {
  page?: number;
  limit?: number;
  status?: PosMachineStatus;
  machine_type?: string;
  search?: string;
}

export interface PosExportRequest {
  format: PosExportFormat;
  date_from: string;
  date_to: string;
  status?: PosTransactionStatus | null;
  terminal_id?: string | null;
}

// ── Response types (matched to live API) ──

export interface PosTransaction {
  id: number;
  razorpay_txn_id: string;
  external_ref: string;
  terminal_id: string;
  amount: string;
  status: PosTransactionStatus;
  rrn: string;
  card_brand: string;
  card_type: string;
  card_number: string;
  issuing_bank: string | null;
  card_classification: string | null;
  card_txn_type: string | null;
  acquiring_bank: string | null;
  payment_mode: string;
  device_serial: string;
  customer_name: string;
  payer_name: string;
  txn_type: string;
  auth_code: string;
  mid: string;
  currency: string;
  receipt_url: string;
  posting_date: string;
  txn_time: string;
  created_at: string;
}

export interface PosTransactionsPagination {
  page: number;
  page_size: number;
  total_records: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PosTransactionsSummary {
  total_transactions: number;
  total_amount: string;
  authorized_count: number;
  captured_count: number;
  failed_count: number;
  refunded_count: number;
  captured_amount: string;
  terminal_count: number;
}

export interface PosTransactionsResponse {
  success: boolean;
  company: string;
  data: PosTransaction[];
  pagination: PosTransactionsPagination;
  summary: PosTransactionsSummary;
}

export interface PosMachine {
  id: string;
  machine_id: string;
  serial_number: string;
  mid: string;
  tid: string;
  brand: string;
  machine_type: string;
  status: PosMachineStatus;
  inventory_status: string;
  delivery_date: string | null;
  installation_date: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosMachinesPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next_page: boolean;
  has_prev_page: boolean;
}

export interface PosMachinesResponse {
  success: boolean;
  company?: string;
  data: PosMachine[];
  pagination: PosMachinesPagination;
}

export interface PosExportJob {
  id: string;
  status: PosExportJobStatus;
  format: PosExportFormat;
  file_url: string | null;
  file_size_bytes?: number;
  record_count?: number;
  created_at: string;
  completed_at: string | null;
  expires_at?: string;
}

export interface PosExportCreateResponse {
  success: boolean;
  data: {
    message: string;
    job_id: string;
    format: PosExportFormat;
    status: PosExportJobStatus;
    remaining_exports_today: number;
  };
}

export interface PosExportStatusResponse {
  success: boolean;
  data: {
    job: PosExportJob;
  };
}

export interface PosApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
