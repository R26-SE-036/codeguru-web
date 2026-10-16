/**
 * The Java foundations course, as Study Guider sends it (GET /api/course and
 * /api/course/units/:id). The block shapes mirror the schema in Study Guider's
 * app/services/course_service.py, which validates every unit before it ships.
 */

export interface CatalogueUnit {
  id: string;
  title: string;
  summary: string;
  minutes: number | null;
  available: boolean;
}

export interface CatalogueModule {
  number: number;
  concept: string;
  title: string;
  blurb: string;
  units: CatalogueUnit[];
}

export interface Catalogue {
  modules: CatalogueModule[];
  units_total: number;
  units_available: number;
}

export interface Program {
  title: string;
  code: string;
  runnable: boolean;
  output?: string | null;
  error?: string | null;
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'callout'; tone: 'info' | 'tip' | 'warn'; title: string; text: string }
  | ({ type: 'code' } & Program)
  | { type: 'compare'; bad: Program; good: Program; note: string }
  | { type: 'table'; caption: string; columns: string[]; rows: string[][]; highlight: number[] }
  | { type: 'diagram'; caption: string; mermaid: string }
  | {
      type: 'array';
      caption: string;
      name: string;
      values: string[];
      highlight: number[];
      outside: number | null;
      note: string;
    }
  | {
      type: 'memory';
      caption: string;
      variables: { name: string; target: string }[];
      objects: { id: string; text: string }[];
      note: string;
    }
  | {
      type: 'chart';
      caption: string;
      x_label: string;
      y_label: string;
      categories: string[];
      series: { name: string; values: number[] }[];
    }
  | { type: 'steps'; title: string; items: string[] }
  | { type: 'check'; question: string; code: string; options: string[]; answer: number; explanation: string }
  | { type: 'keypoints'; items: string[] };

export interface UnitSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Unit {
  id: string;
  concept: string;
  title: string;
  summary: string;
  minutes: number;
  objectives: string[];
  sections: UnitSection[];
  sources: string[];
}

export interface UnitPage {
  unit: Unit;
  module: { number: number; concept: string; title: string };
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}
