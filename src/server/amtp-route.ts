import { Request, Response, NextFunction } from "express";
import { AMTPSchema } from "./amtp-schema";
import { ContentNegotiator, AMTPResponseBuilder } from "./amtp-server";
import { MIMEType } from "../types/amtp.types";

const negotiator = new ContentNegotiator();
const builder = new AMTPResponseBuilder();

function isAmtpPreferred(req: Request): boolean {
  const accept = req.headers.accept || "";
  const mimeType = negotiator.negotiate(accept);
  return mimeType === MIMEType.AMTP_MARKDOWN;
}

export function route<T>(
  schema: AMTPSchema<T>,
  handler: (req: Request, res: Response) => T | Promise<T>
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await handler(req, res);

      if (isAmtpPreferred(req)) {
        const doc = schema.render(data, req.path);
        const { body, headers } = builder.build(doc);
        for (const [key, value] of Object.entries(headers)) {
          if (value) res.setHeader(key, value);
        }
        res.send(body);
      } else {
        res.json(data);
      }
    } catch (err) {
      next(err);
    }
  };
}

export function respond<T>(res: Response, data: T, schema: AMTPSchema<T>, path?: string): void {
  const req = res.req;
  if (!req) {
    res.json(data);
    return;
  }

  if (isAmtpPreferred(req)) {
    const doc = schema.render(data, path || req.path);
    const { body, headers } = builder.build(doc);
    for (const [key, value] of Object.entries(headers)) {
      if (value) res.setHeader(key, value);
    }
    res.send(body);
  } else {
    res.json(data);
  }
}
