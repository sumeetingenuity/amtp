/**
 * AMTP Markdown Parser
 * Parses AMTP-enhanced markdown into structured document AST
 */

import {
  AMTPDocument,
  MarkdownNode,
  MarkdownNodeType,
  Action,
  AMTPAuth,
  Form,
  FormField,
  Link,
  StructuredData,
  DocumentMetadata,
  LinkType,
  FormFieldType,
  HTTPMethod,
  Pagination,
  Permission,
  Policy,
  Skill,
} from "../types/amtp.types";
import {
  DEFAULT_MAX_BODY_SIZE,
  sanitizeActionId,
  sanitizeEndpoint,
  sanitizeHttpMethod,
  sanitizeFreeText,
} from "./security";

export class AMTPMarkdownParser {
  /**
   * Parse markdown string into AMTP document
   */
  parse(markdown: string, path: string): AMTPDocument {
    const lines = markdown.split("\n");
    let lineIdx = 0;

    // Parse title (first H1)
    const titleMatch = lines[lineIdx]?.match(/^# (.+)$/);
    if (!titleMatch) {
      throw new Error("Document must start with H1 title");
    }
    const title = titleMatch[1];
    lineIdx++;

    const nodes: MarkdownNode[] = [];
    const actions: Action[] = [];
    const forms: Form[] = [];
    const links: Link[] = [];
    const structuredData: StructuredData[] = [];
    const metadata: DocumentMetadata = {};
    const permissions: Permission[] = [];
    const policies: Policy[] = [];
    const skills: Skill[] = [];
    let auth: AMTPAuth | undefined;
    let pagination: Pagination | undefined;

    // Parse document body
    while (lineIdx < lines.length) {
      const line = lines[lineIdx];

      if (line.startsWith("```amtp-meta")) {
        const { data, nextIdx } = this.parseMetadataBlock(lines, lineIdx);
        Object.assign(metadata, data);
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-data")) {
        const { data, nextIdx } = this.parseDataBlock(lines, lineIdx);
        structuredData.push(data);
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-pagination")) {
        const { data, nextIdx } = this.parsePaginationBlock(lines, lineIdx);
        pagination = data;
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-action")) {
        const { items, nextIdx } = this.parseActionsBlock(lines, lineIdx);
        actions.push(...items);
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-permissions")) {
        const { items, nextIdx } = this.parsePermissionsBlock(lines, lineIdx);
        permissions.push(...items);
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-policy")) {
        const { items, nextIdx } = this.parsePolicyBlock(lines, lineIdx);
        policies.push(...items);
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-skill")) {
        const { items, nextIdx } = this.parseSkillBlock(lines, lineIdx);
        skills.push(...items);
        lineIdx = nextIdx;
      } else if (line.startsWith("```amtp-auth")) {
        const result = this.parseAuthBlock(lines, lineIdx);
        auth = result.auth;
        lineIdx = result.nextIdx;
      } else if (line.startsWith("## Actions")) {
        const { items, nextIdx } = this.parseActionList(lines, lineIdx + 1);
        actions.push(...items);
        lineIdx = nextIdx;
      } else if (line.startsWith("## ") && this.isForm(lines, lineIdx)) {
        const { form, nextIdx } = this.parseForm(lines, lineIdx);
        forms.push(form);
        lineIdx = nextIdx;
      } else if (line.startsWith("## ") || line.startsWith("### ")) {
        const node = this.parseHeading(line);
        nodes.push(node);
        lineIdx++;
      } else if (line.startsWith("[") && this.isLinkSection(lines, lineIdx)) {
        const { items, nextIdx } = this.parseLinks(lines, lineIdx);
        links.push(...items);
        lineIdx = nextIdx;
      } else if (line.startsWith("![") && this.isImageLine(line)) {
        const node = this.parseImage(line);
        nodes.push(node);

        // Look ahead for optional amtp-meta block for this image (for agent descriptions)
        const nextLineIdx = lineIdx + 1;
        if (nextLineIdx < lines.length && lines[nextLineIdx].startsWith("```amtp-meta")) {
          const { data, nextIdx } = this.parseMetadataBlock(lines, nextLineIdx);
          if (data.description) {
            node.description = sanitizeFreeText(String(data.description), 400);
          }
          node.metadata = { ...(node.metadata || {}), ...data };
          lineIdx = nextIdx;
        } else {
          lineIdx++;
        }
      } else if (line.trim()) {
        // Regular paragraph or content
        const node = this.parseParagraph(line);
        nodes.push(node);
        lineIdx++;
      } else {
        lineIdx++;
      }
    }

    return {
      type: "document",
      version: "1.0",
      title,
      path,
      nodes,
      actions,
      forms,
      links,
      metadata,
      structured_data: structuredData,
      ...(pagination && { pagination }),
      ...((permissions.length > 0) && { permissions }),
      ...((policies.length > 0) && { policies }),
      ...((skills.length > 0) && { skills }),
      ...(auth && { auth }),
    };
  }

  private parseHeading(line: string): MarkdownNode {
    const match = line.match(/^(#{2,3}) (.+)$/);
    const level = match?.[1].length || 2;
    const content = match?.[2] || line;

    return {
      type: MarkdownNodeType.HEADING,
      content,
      metadata: { level },
    };
  }

  private parseParagraph(line: string): MarkdownNode {
    return {
      type: MarkdownNodeType.PARAGRAPH,
      content: line.trim(),
    };
  }

  private parseActionList(
    lines: string[],
    startIdx: number
  ): { items: Action[]; nextIdx: number } {
    const items: Action[] = [];
    let idx = startIdx;

    // Skip leading blank lines
    while (idx < lines.length && !lines[idx].trim()) {
      idx++;
    }

    while (idx < lines.length && lines[idx].trim()) {
      const line = lines[idx].trim();

      // Strict match: only the [ID] part is trusted for the action contract
      const match = line.match(/^\[([A-Z][A-Z0-9_]*)\]\s*-?\s*(.*)$/);
      if (match) {
        const [, rawName, rawDesc] = match;

        // SECURITY: Strict sanitization — extra text on the line is ignored for id/endpoint
        const name = sanitizeActionId(rawName);

        // Free-text description is heavily sanitized to prevent prompt injection
        const description = sanitizeFreeText(rawDesc, 200) || undefined;

        items.push({
          id: name.toLowerCase(),
          label: name,
          description,
          method: HTTPMethod.POST,
          endpoint: `/api/actions/${name.toLowerCase()}`,
        });
        idx++;
      } else {
        // Any non-action line stops the action section — no bleed
        break;
      }
    }

    return { items, nextIdx: idx };
  }

  private parseForm(
    lines: string[],
    startIdx: number
  ): { form: Form; nextIdx: number } {
    let idx = startIdx;

    // Parse form header (## Form Title)
    idx++; // Skip header line

    // SECURITY: Only these four prefixes are ever trusted for structured data
    let action = "";
    let method = "POST";
    let endpoint = "";

    // Look for ACTION, METHOD, ENDPOINT (strict, one per key)
    while (idx < lines.length && lines[idx].trim()) {
      const line = lines[idx].trim();

      if (line.startsWith("ACTION:")) {
        const raw = line.substring(7).trim();
        action = sanitizeActionId(raw);
      } else if (line.startsWith("METHOD:")) {
        const raw = line.substring(7).trim();
        method = sanitizeHttpMethod(raw);
      } else if (line.startsWith("ENDPOINT:")) {
        const raw = line.substring(9).trim();
        endpoint = sanitizeEndpoint(raw);
      }

      // Stop at first FIELD: or next section
      if (line.startsWith("FIELD:")) {
        break;
      }
      idx++;
    }

    // Parse fields (each FIELD: line is processed strictly inside parseFormField)
    const fields: FormField[] = [];
    while (idx < lines.length && lines[idx].trim().startsWith("FIELD:")) {
      const field = this.parseFormField(lines, idx);
      fields.push(field.field);
      idx = field.nextIdx;
    }

    return {
      form: {
        id: action || "UNKNOWN_FORM",
        action,
        method: method as any,
        endpoint,
        fields,
      },
      nextIdx: idx,
    };
  }

  private parseFormField(
    lines: string[],
    startIdx: number
  ): { field: FormField; nextIdx: number } {
    let idx = startIdx;
    const line = lines[idx].trim();

    // Strict field name extraction (only safe characters)
    const nameMatch = line.match(/^FIELD:\s*([A-Za-z0-9_.-]{1,64})/);
    const rawName = nameMatch?.[1] || "field";
    const name = rawName.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64);

    const field: FormField = {
      name,
      type: FormFieldType.TEXT,
    };

    idx++;

    // Parse field properties — only known prefixes are honored
    while (idx < lines.length && !lines[idx].trim().startsWith("FIELD:")) {
      const propLine = lines[idx].trim();

      if (!propLine || propLine.startsWith("##")) {
        break;
      }

      if (propLine.startsWith("TYPE:")) {
        const typeStr = propLine.substring(5).trim().toLowerCase().slice(0, 20);
        // Only accept known enum values
        if (Object.values(FormFieldType).includes(typeStr as any)) {
          field.type = typeStr as FormFieldType;
        }
      } else if (propLine.startsWith("LABEL:")) {
        field.label = sanitizeFreeText(propLine.substring(6), 120);
      } else if (propLine.startsWith("REQUIRED:")) {
        field.required = /true|yes|1/i.test(propLine.substring(9));
      } else if (propLine.startsWith("DEFAULT:")) {
        field.default = sanitizeFreeText(propLine.substring(8), 200);
      } else if (propLine.startsWith("OPTIONS:")) {
        const optionsStr = sanitizeFreeText(propLine.substring(8), 300);
        field.options = optionsStr
          .split(",")
          .map((opt) => opt.trim())
          .filter(Boolean)
          .slice(0, 50)
          .map((opt) => ({
            value: opt.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64),
            label: sanitizeFreeText(opt, 80),
          }));
      } else if (propLine.startsWith("MAX_LENGTH:")) {
        const n = parseInt(propLine.substring(11).trim(), 10);
        if (!isNaN(n) && n > 0) field.maxLength = Math.min(n, 10000);
      } else if (propLine.startsWith("PLACEHOLDER:")) {
        field.placeholder = sanitizeFreeText(propLine.substring(12), 200);
      }

      idx++;
    }

    return { field, nextIdx: idx };
  }

  private parseLinks(
    lines: string[],
    startIdx: number
  ): { items: Link[]; nextIdx: number } {
    const items: Link[] = [];
    let idx = startIdx;

    while (idx < lines.length && lines[idx].trim()) {
      const line = lines[idx].trim();

      // Match [text](url)
      const match = line.match(/^\[(.+?)\]\((.+?)\)(.*)$/);
      if (match) {
        const [, text, url, extra] = match;
        items.push({
          text,
          url,
          type: this.determineLinkType(url),
          title: extra ? extra.trim() : undefined,
        });
        idx++;
      } else if (line.startsWith("- [")) {
        const linkMatch = line.match(/^-\s+\[(.+?)\]\((.+?)\)(.*)$/);
        if (linkMatch) {
          const [, text, url, extra] = linkMatch;
          items.push({
            text,
            url,
            type: this.determineLinkType(url),
            title: extra ? extra.trim() : undefined,
          });
        }
        idx++;
      } else {
        break;
      }
    }

    return { items, nextIdx: idx };
  }

  private parseMetadataBlock(
    lines: string[],
    startIdx: number
  ): { data: Record<string, unknown>; nextIdx: number } {
    let idx = startIdx + 1;
    let jsonStr = "";

    while (idx < lines.length && !lines[idx].includes("```")) {
      // SECURITY: Guard against payload bombs — skip if already at max size
      if (jsonStr.length > DEFAULT_MAX_BODY_SIZE) {
        return { data: { _error: "metadata block too large" }, nextIdx: lines.length };
      }
      jsonStr += lines[idx] + "\n";
      idx++;
    }

    try {
      const data = JSON.parse(jsonStr);
      return { data, nextIdx: idx + 1 };
    } catch (e) {
      return { data: {}, nextIdx: idx + 1 };
    }
  }

  private parseDataBlock(
    lines: string[],
    startIdx: number
  ): { data: StructuredData; nextIdx: number } {
    let idx = startIdx + 1;
    let jsonStr = "";

    while (idx < lines.length && !lines[idx].includes("```")) {
      // SECURITY: Guard against payload bombs — skip if already at max size
      if (jsonStr.length > DEFAULT_MAX_BODY_SIZE) {
        return { data: { "@type": "Unknown", _error: "data block too large" }, nextIdx: lines.length };
      }
      jsonStr += lines[idx] + "\n";
      idx++;
    }

    try {
      const data = JSON.parse(jsonStr);
      return { data, nextIdx: idx + 1 };
    } catch (e) {
      return { data: { "@type": "Unknown" }, nextIdx: idx + 1 };
    }
  }

  private parsePaginationBlock(
    lines: string[],
    startIdx: number
  ): { data: Pagination; nextIdx: number } {
    let idx = startIdx + 1;
    let jsonStr = "";

    while (idx < lines.length && !lines[idx].includes("```")) {
      if (jsonStr.length > DEFAULT_MAX_BODY_SIZE) {
        return {
          data: { hasNextPage: false },
          nextIdx: lines.length,
        };
      }
      jsonStr += lines[idx] + "\n";
      idx++;
    }

    try {
      const data = JSON.parse(jsonStr) as Pagination;
      return { data, nextIdx: idx + 1 };
    } catch {
      return { data: { hasNextPage: false }, nextIdx: idx + 1 };
    }
  }

  private parseJsonBlock<T>(lines: string[], startIdx: number): { items: T[]; nextIdx: number } {
    let idx = startIdx + 1;
    let jsonStr = "";

    while (idx < lines.length && !lines[idx].includes("```")) {
      if (jsonStr.length > DEFAULT_MAX_BODY_SIZE) {
        return { items: [], nextIdx: lines.length };
      }
      jsonStr += lines[idx] + "\n";
      idx++;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return { items: arr as T[], nextIdx: idx + 1 };
    } catch {
      return { items: [], nextIdx: idx + 1 };
    }
  }

  private parseActionsBlock(lines: string[], startIdx: number): { items: Action[]; nextIdx: number } {
    return this.parseJsonBlock<Action>(lines, startIdx);
  }

  private parsePermissionsBlock(lines: string[], startIdx: number): { items: Permission[]; nextIdx: number } {
    return this.parseJsonBlock<Permission>(lines, startIdx);
  }

  private parsePolicyBlock(lines: string[], startIdx: number): { items: Policy[]; nextIdx: number } {
    return this.parseJsonBlock<Policy>(lines, startIdx);
  }

  private parseSkillBlock(lines: string[], startIdx: number): { items: Skill[]; nextIdx: number } {
    return this.parseJsonBlock<Skill>(lines, startIdx);
  }

  private parseAuthBlock(lines: string[], startIdx: number): { auth: AMTPAuth | undefined; nextIdx: number } {
    let idx = startIdx + 1;
    let jsonStr = "";

    while (idx < lines.length && !lines[idx].includes("```")) {
      if (jsonStr.length > DEFAULT_MAX_BODY_SIZE) {
        return { auth: undefined, nextIdx: lines.length };
      }
      jsonStr += lines[idx] + "\n";
      idx++;
    }

    try {
      const data = JSON.parse(jsonStr) as AMTPAuth;
      return { auth: data, nextIdx: idx + 1 };
    } catch {
      return { auth: undefined, nextIdx: idx + 1 };
    }
  }

  private determineLinkType(url: string): LinkType {
    if (url.startsWith("http")) {
      return LinkType.EXTERNAL;
    } else if (url.startsWith("/")) {
      return LinkType.INTERNAL;
    }
    return LinkType.NAVIGATION;
  }

  private isForm(lines: string[], idx: number): boolean {
    // Look ahead for ACTION: or FIELD: keywords
    for (let i = idx + 1; i < Math.min(idx + 20, lines.length); i++) {
      if (lines[i].includes("ACTION:") || lines[i].includes("FIELD:")) {
        return true;
      }
    }
    return false;
  }

  private isLinkSection(lines: string[], idx: number): boolean {
    const line = lines[idx];
    return line.includes("[") && line.includes("](");
  }

  private isImageLine(line: string): boolean {
    return /^\s*!\[.*\]\(.*\)\s*$/.test(line);
  }

  private parseImage(line: string): MarkdownNode {
    // Basic markdown image: ![alt](url "title") or ![alt](url)
    const match = line.match(/!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/);
    if (!match) {
      return {
        type: MarkdownNodeType.IMAGE,
        content: line.trim(),
      };
    }

    const [, alt, url, title] = match;
    const node: MarkdownNode = {
      type: MarkdownNodeType.IMAGE,
      alt: alt || undefined,
      url: url || undefined,
      title: title || undefined,
      mediaType: 'image',
    };

    return node;
  }
}

export default AMTPMarkdownParser;
