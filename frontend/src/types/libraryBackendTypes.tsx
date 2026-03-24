export interface BrainBook {
  id: string;
  filename: string;
  original_name: string;
  title: string;
  author: string;
}

export interface DiscoveryResult {
  id: string;
  title: string;
  author: string;
  year: string;
  source: "Gutenberg" | "InternetArchive";
  cover?: string;
  // NEW: Optional field for contextual recommendations
  recommendation_reason?: string;
}

export interface Facet {
  name: string;
  count: number;
}

export interface DiscoverProps {
  onStartDownload: (book: any) => void;
}
