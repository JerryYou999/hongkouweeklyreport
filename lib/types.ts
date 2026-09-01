export type ReportRecord = {
  id: string;
  iso_year: number;
  iso_week: number;
  version_number: number;
  title: string;
  report_date: string;
  author_name: string | null;
  department: string | null;
  tags_json: string;
  original_filename: string;
  original_key: string;
  sanitized_key: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  plain_text: string;
  is_current: number;
  supersedes_report_id: string | null;
  created_at: string;
};

export type SectionRecord = {
  id: string;
  report_id: string;
  order_index: number;
  heading: string | null;
  heading_path: string;
  anchor_id: string;
  plain_text: string;
  char_count: number;
};
