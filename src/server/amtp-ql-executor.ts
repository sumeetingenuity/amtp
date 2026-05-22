/**
 * AMTP-QL Executor
 * Executes a parsed AMTPQLParsedQuery against an AMTPDocument and returns projected AMTPQLResult
 */

import {
  AMTPDocument,
  AMTPQLParsedQuery,
  AMTPQLResult,
  AMTPQLSelection,
  Pagination,
  Action,
  Form,
  Link,
  StructuredData,
  DocumentMetadata,
} from "../types/amtp.types";
import { parseAMTPQL } from "./amtp-ql-parser";

const MAX_DEPTH = 5;

export class AMTPQLExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AMTPQLExecutionError";
  }
}

export class AMTPQLExecutor {
  /**
   * Execute the parsed query against the document.
   */
  execute(doc: AMTPDocument, parsed: AMTPQLParsedQuery): AMTPQLResult {
    const result: AMTPQLResult = {};

    for (const sel of parsed.selections) {
      if (sel.field === "document") {
        Object.assign(result, this.projectDocument(doc, sel, 0));
      } else {
        // future: support top-level other roots
        throw new AMTPQLExecutionError(`Unknown root field: ${sel.field}`);
      }
    }

    return result;
  }

  private projectDocument(doc: AMTPDocument, sel: AMTPQLSelection, depth: number): Partial<AMTPQLResult> {
    if (depth > MAX_DEPTH) {
      throw new AMTPQLExecutionError("Query depth limit exceeded");
    }

    const out: any = {};

    const subSels = sel.selections || [];

    if (subSels.length === 0) {
      // default projection if no sub-selection
      out.title = doc.title;
      out.actions = doc.actions;
      return out;
    }

    for (const sub of subSels) {
      switch (sub.field) {
        case "title":
          out.title = doc.title;
          break;
        case "path":
          out.path = doc.path;
          break;
        case "version":
          out.version = doc.version;
          break;
        case "metadata": {
          const metaSel = sub.selections;
          out.metadata = this.projectMetadata(doc.metadata, metaSel);
          break;
        }
        case "pagination":
          out.pagination = this.projectPagination(doc.pagination);
          break;
        case "actions":
          out.actions = this.projectActions(doc.actions, sub.selections);
          break;
        case "forms":
          out.forms = this.projectForms(doc.forms, sub.selections);
          break;
        case "links":
          out.links = this.projectLinks(doc.links, sub.selections);
          break;
        case "structured_data":
          out.structured_data = this.projectStructuredData(doc.structured_data, sub.selections);
          break;
        case "nodes":
          out.nodes = this.projectNodes(doc.nodes, sub.arguments, sub.selections);
          break;
        default:
          throw new AMTPQLExecutionError(`Unknown document field: ${sub.field}`);
      }
    }

    return out;
  }

  private projectMetadata(meta: DocumentMetadata, subSels?: AMTPQLSelection[]): Partial<DocumentMetadata> {
    if (!subSels || subSels.length === 0) return { ...meta };
    const out: any = {};
    for (const s of subSels) {
      const key = s.field as keyof DocumentMetadata;
      if (key in meta) out[key] = meta[key];
    }
    return out;
  }

  private projectPagination(pag?: Pagination): Pagination | undefined {
    return pag ? { ...pag } : undefined;
  }

  private projectActions(actions: Action[], subSels?: AMTPQLSelection[]): any[] {
    if (!subSels || subSels.length === 0) {
      return actions.map(a => ({ id: a.id, description: a.description, parameters: a.parameters }));
    }
    return actions.map(action => {
      const item: any = {};
      for (const s of subSels) {
        if (s.field === "id") item.id = action.id;
        if (s.field === "description") item.description = action.description;
        if (s.field === "parameters") item.parameters = action.parameters;
      }
      return item;
    });
  }

  private projectForms(forms: Form[], subSels?: AMTPQLSelection[]): any[] {
    if (!subSels || subSels.length === 0) {
      return forms.map(f => ({ id: f.id, fields: f.fields }));
    }
    return forms.map(form => {
      const item: any = {};
      for (const s of subSels) {
        if (s.field === "id") item.id = form.id;
        if (s.field === "fields") item.fields = form.fields;
      }
      return item;
    });
  }

  private projectLinks(links: Link[], subSels?: AMTPQLSelection[]): any[] {
    if (!subSels || subSels.length === 0) {
      return links.map(l => ({ text: l.text, url: l.url, type: l.type }));
    }
    return links.map(link => {
      const item: any = {};
      for (const s of subSels) {
        if (s.field in link) (item as any)[s.field] = (link as any)[s.field];
      }
      return item;
    });
  }

  private projectStructuredData(data?: StructuredData[], subSels?: AMTPQLSelection[]): any[] {
    if (!data) return [];
    if (!subSels || subSels.length === 0) return data;
    return data.map(d => {
      const item: any = {};
      for (const s of subSels) {
        if (s.field === "type") item.type = d.type;
        if (s.field === "data") item.data = d.data;
      }
      return item;
    });
  }

  private projectNodes(nodes: any[], args?: Record<string, unknown>, subSels?: AMTPQLSelection[]): any[] {
    let filtered = nodes;

    if (args?.type) {
      const wanted = (Array.isArray(args.type) ? args.type : [args.type]).map((t: string) => t.toLowerCase());
      filtered = filtered.filter(n => wanted.includes(String(n.type).toLowerCase()));
    }
    if (typeof args?.limit === "number") {
      filtered = filtered.slice(0, args.limit as number);
    }

    if (!subSels || subSels.length === 0) {
      return filtered.map(n => ({ type: n.type, content: n.content, description: n.description }));
    }

    return filtered.map(node => {
      const item: any = {};
      for (const s of subSels) {
        if (s.field === "type") item.type = node.type;
        if (s.field === "content") item.content = node.content;
        if (s.field === "description") item.description = node.description;
        if (s.field === "children" && node.children) {
          item.children = this.projectNodes(node.children, undefined, s.selections);
        }
      }
      return item;
    });
  }
}

/** Convenience: parse + execute in one call */
export function executeAMTPQL(
  doc: AMTPDocument,
  rawQuery: string
): AMTPQLResult {
  const parsed = parseAMTPQL(rawQuery);
  const executor = new AMTPQLExecutor();
  return executor.execute(doc, parsed);
}
