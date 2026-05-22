/**
 * AMTP-QL Parser
 * Parses a restricted GraphQL-like query string into AMTPQLParsedQuery AST
 * Supports: document { field(args) { sub } , ... }
 */

import {
  AMTPQLParsedQuery,
  AMTPQLSelection,
} from "../types/amtp.types";

export class AMTPQLSyntaxError extends Error {
  constructor(message: string, public position?: number) {
    super(message);
    this.name = "AMTPQLSyntaxError";
  }
}

export class AMTPQLParser {
  private query: string;
  private pos: number = 0;
  private len: number;

  constructor(query: string) {
    // Normalize: remove comments, extra whitespace
    this.query = query
      .replace(/#[^\n]*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    this.len = this.query.length;
  }

  parse(): AMTPQLParsedQuery {
    this.pos = 0;
    this.expect("query");
    this.skipWhitespace();
    const selections = this.parseSelectionSet();
    this.skipWhitespace();
    if (this.pos < this.len) {
      throw new AMTPQLSyntaxError(`Unexpected input after query at ${this.pos}`);
    }
    return { selections };
  }

  private parseSelectionSet(): AMTPQLSelection[] {
    this.expect("{");
    const selections: AMTPQLSelection[] = [];
    this.skipWhitespace();

    while (this.pos < this.len && this.query[this.pos] !== "}") {
      const field = this.parseName();
      this.skipWhitespace();

      let args: Record<string, unknown> | undefined;
      if (this.query[this.pos] === "(") {
        args = this.parseArguments();
        this.skipWhitespace();
      }

      let subSelections: AMTPQLSelection[] | undefined;
      if (this.query[this.pos] === "{") {
        subSelections = this.parseSelectionSet();
        this.skipWhitespace();
      }

      selections.push({
        field,
        arguments: args,
        selections: subSelections,
      });

      this.skipWhitespace();
      if (this.query[this.pos] === ",") {
        this.pos++;
        this.skipWhitespace();
      }
    }

    this.expect("}");
    return selections;
  }

  private parseArguments(): Record<string, unknown> {
    this.expect("(");
    const args: Record<string, unknown> = {};
    this.skipWhitespace();

    while (this.pos < this.len && this.query[this.pos] !== ")") {
      const name = this.parseName();
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      const value = this.parseValue();
      args[name] = value;
      this.skipWhitespace();

      if (this.query[this.pos] === ",") {
        this.pos++;
        this.skipWhitespace();
      }
    }

    this.expect(")");
    return args;
  }

  private parseValue(): unknown {
    const ch = this.query[this.pos];

    if (ch === '"') {
      return this.parseString();
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      return this.parseNumber();
    }
    if (ch === "t" || ch === "f") {
      return this.parseBoolean();
    }
    if (ch === "n") {
      this.expect("null");
      return null;
    }
    if (ch === "[") {
      return this.parseList();
    }
    if (ch === "{") {
      return this.parseObject();
    }

    // bare identifier as string (for enums etc.)
    return this.parseName();
  }

  private parseString(): string {
    this.expect('"');
    let str = "";
    while (this.pos < this.len && this.query[this.pos] !== '"') {
      if (this.query[this.pos] === "\\") {
        this.pos++;
        const esc = this.query[this.pos++];
        str += esc === "n" ? "\n" : esc;
      } else {
        str += this.query[this.pos++];
      }
    }
    this.expect('"');
    return str;
  }

  private parseNumber(): number {
    const start = this.pos;
    if (this.query[this.pos] === "-") this.pos++;
    while (this.pos < this.len && /[0-9.]/.test(this.query[this.pos])) this.pos++;
    return Number(this.query.slice(start, this.pos));
  }

  private parseBoolean(): boolean {
    if (this.query.slice(this.pos, this.pos + 4) === "true") {
      this.pos += 4;
      return true;
    }
    if (this.query.slice(this.pos, this.pos + 5) === "false") {
      this.pos += 5;
      return false;
    }
    throw new AMTPQLSyntaxError("Invalid boolean", this.pos);
  }

  private parseList(): unknown[] {
    this.expect("[");
    const list: unknown[] = [];
    this.skipWhitespace();
    while (this.pos < this.len && this.query[this.pos] !== "]") {
      list.push(this.parseValue());
      this.skipWhitespace();
      if (this.query[this.pos] === ",") {
        this.pos++;
        this.skipWhitespace();
      }
    }
    this.expect("]");
    return list;
  }

  private parseObject(): Record<string, unknown> {
    this.expect("{");
    const obj: Record<string, unknown> = {};
    this.skipWhitespace();
    while (this.pos < this.len && this.query[this.pos] !== "}") {
      const key = this.parseName();
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      obj[key] = this.parseValue();
      this.skipWhitespace();
      if (this.query[this.pos] === ",") {
        this.pos++;
        this.skipWhitespace();
      }
    }
    this.expect("}");
    return obj;
  }

  private parseName(): string {
    const start = this.pos;
    while (this.pos < this.len && /[a-zA-Z0-9_]/.test(this.query[this.pos])) {
      this.pos++;
    }
    const name = this.query.slice(start, this.pos);
    if (!name) {
      throw new AMTPQLSyntaxError("Expected name", start);
    }
    return name;
  }

  private skipWhitespace() {
    while (this.pos < this.len && /\s/.test(this.query[this.pos])) this.pos++;
  }

  private expect(str: string) {
    this.skipWhitespace();
    if (this.query.slice(this.pos, this.pos + str.length) !== str) {
      throw new AMTPQLSyntaxError(`Expected "${str}"`, this.pos);
    }
    this.pos += str.length;
  }
}

/** Convenience function */
export function parseAMTPQL(query: string): AMTPQLParsedQuery {
  const parser = new AMTPQLParser(query);
  return parser.parse();
}
