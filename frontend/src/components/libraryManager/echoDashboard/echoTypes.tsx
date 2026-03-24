export interface EchoResult {
  id: string | number;
  text: string;
  score: number;
  ui_tag?: "SUPPORT" | "CHALLENGE" | "CONTEXT";
  title?: string;
  author?: string;
  year?: number;
  group_tag?: string; // <--- NEW FIELD
  stance?: string;
  stance_score?: number;
  link_to_prev?:
    | "ROOT"
    | "CITES"
    | "CRITIQUE"
    | "EXPANDS"
    | "DRIFT"
    | "RELATED";
  is_estimated?: boolean;
  shadow_result?: {
    id: string | number;
    text: string;
    title?: string;
    author?: string;
    year?: number;
    evolution_status:
      | "STAGNANT (ECHO)"
      | "EVOLVED (CRITIQUE)"
      | "DRIFTED"
      | "UNKNOWN";
  };
  type: "brain" | "ghost"; // Distinguishes "Owned" vs "Recommended"
  relation: "support" | "counterpoint" | "tangent"; // The Dialectic Tag
  similarity: number; // 0-100 score
  era: string;
}

export interface EchoRecommendation {
  id: string;
  title: string;
  author: string;
  year: number;
  similarity: number;
  description: string;
}
// --- PROPS ---
export interface EchoSidebarProps {
  isOpen: boolean;
  onOpen?: () => void;
  onClose: () => void;
  results: EchoBookGroup[];
  query: string;
  loading: boolean;
  onSearch: (q: string) => void;

  // New Props for the Recommendation Zone
  recommendations?: EchoRecommendation[];
  loadingRecommendations?: boolean;
  onIngestRecommendation?: (id: string, title: string) => void;
}

// --- THE ATOMIC THOUGHT (Chunk) ---
export interface EchoChunk {
  title?: string;
  text: string;
  relation: string; // "SUPPORT", "REFUTE", "EXPAND", etc.
  similarity: number; // 0-100
  bridge?: string;
  chapter: string;
}
// --- THE CONTAINER (Book) ---
export interface EchoBookGroup {
  id?: string | number; // Made optional for safety
  title: string;
  author: string;
  year: number;
  era?: string; // Optional since we calculate it dynamically
  is_owned: boolean; // ✅ FIX: Added the ownership flag
  max_similarity?: number;
  chunks: EchoChunk[];
}
