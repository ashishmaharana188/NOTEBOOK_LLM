export interface ReaderBook {
  title: string;
  filename: string;
  url: string;
  extension?: string;
  author?: string;
  lid?: string;
  file_fingerprint?: string;
  initialReaderBootstrap?: ReaderBootstrapPayload;
  [key: string]: any;
}

export interface ReaderLocationPayload {
  location: string | number;
  locationType?: string;
  progressPercent?: number;
  pageLabel?: string;
  viewState?: Record<string, any>;
}

export interface ReaderSession {
  session_id: string;
  book_key: string;
  lid?: string | null;
  filename: string;
  format?: string;
  last_location?: string | null;
  last_location_type?: string;
  progress_percent: number;
  last_page_label?: string;
  file_fingerprint?: string;
  view_state: Record<string, any>;
  last_opened_at?: string;
  updated_at?: string;
}

export interface ReaderAnnotation {
  annotation_id: string;
  book_key: string;
  lid?: string | null;
  filename: string;
  format?: string;
  anchor: Record<string, any>;
  quote_text: string;
  title: string;
  note: string;
  color: string;
  kind: string;
  page_label: string;
  chapter_label: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReaderManifestSection {
  section_index: number;
  label: string;
  start_offset?: number;
  end_offset?: number;
  char_length?: number;
  preview?: string;
  href?: string;
  char_index?: number;
  content?: string;
}

export interface ReaderManifestSummary {
  status: string;
  page_count: number;
  toc: any[];
  section_index: ReaderManifestSection[];
  location_map: any[];
  content_meta: Record<string, any>;
  updated_at?: string;
}

export interface ReaderBootstrapPayload {
  book: ReaderBook;
  session: ReaderSession | null;
  manifest: ReaderManifestSummary;
  annotations: ReaderAnnotation[];
}

export interface ReaderSettings {
  theme: "light" | "dark" | "sepia";
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  pageMargin: number;
  flow: "paginated" | "scrolled";
  spread: "auto" | "none" | "always";
  alignment?: "default" | "left" | "justify";
  brightness?: number;
  nightLight?: boolean;
}

// Flexible Theme Interface
export interface ThemeStyles {
  light: {
    [selector: string]: { [property: string]: string };
  };
  sepia: {
    [selector: string]: { [property: string]: string };
  };
  dark: {
    [selector: string]: { [property: string]: string };
  };
}

export interface TocItem {
  label: string;
  href: string;
}

export interface ReaderProps {
  book: ReaderBook;
  initialLocation: string | number | null;
  onSaveLocation: (payload: ReaderLocationPayload) => void;
  onSelection?: (text: string) => void;
  content?: string;
}

// 2. Parent Props (Used by MainReader) [ADDED THIS]
// This matches exactly what App.tsx passes.
export interface MainReaderProps {
  book: ReaderBook | null;
  bookContent?: string;
  onFindEchoes?: (text: string) => void;
  onAskRag?: (text: string, prompt: string) => void;
  onBack?: () => void;
}

export interface ReaderSearchResult {
  result_id: string;
  query: string;
  snippet: string;
  match_start: number;
  match_end: number;
  char_index: number;
  section_index?: number;
  page?: number;
  label?: string;
  href?: string;
  page_label?: string;
}

export interface DownloadingBook {
  title: string;
  filename: string;
  id?: string;
}
