import type {
  BrainBook,
  DiscoveryResult,
} from "../../types/libraryBackendTypes.js";

export interface LibraryManagerProps {
  libraryFiles?: string[];
  brainBooks?: BrainBook[];
  onStartDownload: (book: any) => void;

  ingesting: string | null;
  ingestQueue?: IngestQueueState | undefined;
  onUpload: (file: File) => Promise<void>;
  onIngest: (filename: string) => Promise<void>;
  onCancelIngest: (filename: string) => Promise<void>;
  onDeleteLibrary: (filename: string, bulk?: boolean) => Promise<void>;
  onDeleteBrain: (filename: string, bulk?: boolean) => Promise<void>;
  onRead: (filename: string, isProcessed?: boolean) => void;
  onOpenEchoDashboard?: () => void;

  discoveryResults?: DiscoveryResult[];
  facets?: any[];
}

export interface LibraryManagerLogic extends LibraryManagerProps {
  // STATE
  tab: string;
  setTab: (t: string) => void;
  loading: boolean; // <--- ADDED THIS (Fixes your error)

  // SEARCH & DISCOVERY STATE
  searchSource: "Gutenberg" | "InternetArchive";
  setSearchSource: (s: "Gutenberg" | "InternetArchive") => void;
  discoveryResults: DiscoveryResult[];
  totalResults: number;
  facets: any[];
  page: number;

  // LOCAL SEARCH INPUTS
  simpleQuery: string;
  setSimpleQuery: (q: string) => void;
  filter: string;
  setFilter: (f: string) => void;

  // ADVANCED SEARCH
  isAdvanced: boolean;
  setIsAdvanced: (val: boolean) => void;
  advState: { title: string; author: string; subject: string };
  setAdvState: (s: { title: string; author: string; subject: string }) => void;

  // SELECTION
  selectedLib: Set<string>;
  selectedBrain: Set<string>;
  selectedDiscover: Set<string>;

  // DOWNLOAD
  downloadFormat: string;
  setDownloadFormat: (f: string) => void;

  // HANDLERS
  toggleLib: (file: string) => void;
  toggleAllLib: () => void;
  toggleBrain: (file: string) => void;
  toggleAllBrain: () => void;
  toggleDiscover: (book: DiscoveryResult) => void;
  toggleAllDiscover: () => void;

  handleBulkIngest: () => Promise<void>;
  handleBulkDeleteLib: () => Promise<void>;
  handleBulkDeleteBrain: () => Promise<void>;

  // UI HANDLERS (Mapped from internal logic)
  handleSearch: () => void;
  handleFacet: (topic: string) => void;
  onChangePage: (page: number) => void;
  onSearchDiscovery: (q: string, f: string, p: number, adv?: any) => void;
  onDownload: (book: DiscoveryResult, format: string) => Promise<void>;
  onDirectIngest: (book: DiscoveryResult, format: string) => Promise<void>;

  handleBulkDownloadDiscover: () => Promise<void>;
  handleBulkIngestDiscover: () => Promise<void>;
}

export interface DiscoverProps {
  onStartDownload: (book: any) => void;
}

export interface IngestQueueItem {
  job_id: string;
  kind: string;
  source: string;
  status: string;
  cancel_requested?: boolean;
  phase?: string;
  progress?: number;
  chunk_total?: number | null;
  embedded_chunks?: number | null;
  filename: string;
  title: string;
  downloaded_filename?: string;
}

export interface IngestQueueState {
  current: IngestQueueItem | null;
  queued: IngestQueueItem[];
  counts: {
    active: number;
    queued: number;
    total: number;
  };
  updated_at?: number | null;
}
