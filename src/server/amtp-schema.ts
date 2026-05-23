import {
  AMTPDocument,
  MarkdownNode,
  MarkdownNodeType,
  Action,
  HTTPMethod,
  LinkType,
  ParameterType,
  DocumentMetadata,
} from "../types/amtp.types";

export interface AMTPFieldDef<T> {
  label: string;
  value: (data: T) => string;
}

export interface AMTPActionDef<T> {
  id: string;
  label?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string | ((data: T) => string);
  description?: string;
  requiresAuthentication?: boolean;
  parameters?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }>;
}

export interface AMTPLinkDef<T> {
  text: string;
  url: string | ((data: T) => string);
}

export interface AMTPSchemaDefinition<T> {
  title?: string | ((data: T) => string);
  description?: string | ((data: T) => string);
  fields?: AMTPFieldDef<T>[];
  actions?: AMTPActionDef<T>[];
  links?: AMTPLinkDef<T>[];
  metadata?: ((data: T) => Record<string, unknown>) | Record<string, unknown>;
}

export class AMTPSchema<T> {
  constructor(private def: AMTPSchemaDefinition<T>) {}

  render(data: T, path: string = "/"): AMTPDocument {
    const resolve = <R>(val: R | ((d: T) => R)): R =>
      typeof val === "function" ? (val as (d: T) => R)(data) : val;

    const title = this.def.title ? resolve(this.def.title) : "Untitled";
    const description = this.def.description
      ? resolve(this.def.description)
      : undefined;

    const nodes: MarkdownNode[] = [];

    if (description) {
      nodes.push({ type: MarkdownNodeType.PARAGRAPH, content: description });
    }

    if (this.def.fields) {
      for (const field of this.def.fields) {
        nodes.push({
          type: MarkdownNodeType.PARAGRAPH,
          content: `${field.label}: ${field.value(data)}`,
        });
      }
    }

    const actions: Action[] = (this.def.actions || []).map((a) => ({
      id: a.id,
      label: a.label || a.id,
      method: (a.method?.toUpperCase() as HTTPMethod) || HTTPMethod.POST,
      endpoint: resolve(a.endpoint),
      description: a.description,
      requiresAuthentication: a.requiresAuthentication,
      parameters: a.parameters?.map((p) => ({
        ...p,
        type: p.type as ParameterType,
      })),
    }));

    const links = (this.def.links || []).map((l) => ({
      text: l.text,
      url: resolve(l.url),
      type: LinkType.INTERNAL,
    }));

    const metadata: DocumentMetadata = {
      ...(this.def.metadata
        ? typeof this.def.metadata === "function"
          ? this.def.metadata(data)
          : this.def.metadata
        : {}),
    };

    return {
      type: "document",
      version: "1.0",
      title,
      path,
      nodes,
      actions,
      forms: [],
      links,
      metadata,
    };
  }
}
