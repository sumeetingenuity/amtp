# AMTP Security Hardening Guide

## Overview

This document outlines security measures implemented in AMTP to prevent common vulnerabilities and attacks.

---

## 1. Input Validation & Sanitization

### Email Validation
```typescript
// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (email: string): boolean => emailRegex.test(email);

// Reject suspicious patterns
const isSuspicious = (email: string): boolean => {
  return /[<>\"'`]/g.test(email);
};
```

### URL Validation
```typescript
// Validate URLs using URL constructor
const isValidUrl = (urlString: string, baseUrl?: string): boolean => {
  try {
    new URL(urlString, baseUrl);
    return true;
  } catch {
    return false;
  }
};
```

### String Length Limits
```typescript
const MAX_FIELD_LENGTH = 255;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;

const validateLength = (value: string, max: number): boolean => {
  return value.length <= max;
};
```

### XSS Prevention
```typescript
// Escape HTML special characters
const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
};

// Example: Escape user input in markdown
const userContent = '<script>alert("xss")</script>';
const safe = escapeHtml(userContent);
// Result: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;
```

### SQL Injection Prevention
```typescript
// Use parameterized queries (NOT string concatenation)
// ❌ BAD:
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ GOOD:
const query = "SELECT * FROM users WHERE id = ?";
const result = await db.query(query, [userId]);
```

### Form Field Validation
```typescript
interface FieldValidation {
  type: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
}

const validateField = (
  value: unknown,
  validation: FieldValidation
): boolean => {
  // Type check
  if (typeof value !== "string") return false;

  // Length check
  if (validation.minLength && value.length < validation.minLength)
    return false;
  if (validation.maxLength && value.length > validation.maxLength)
    return false;

  // Pattern check
  if (validation.pattern) {
    const regex = new RegExp(validation.pattern);
    if (!regex.test(value)) return false;
  }

  // Enum check
  if (validation.enum && !validation.enum.includes(value)) return false;

  return true;
};
```

---

## 2. Authentication & Authorization

### Session Security
```typescript
interface SessionSecurityConfig {
  // Use secure, random session IDs
  generateSessionId: () => string;
  
  // Session timeout (default: 24 hours)
  sessionTimeout: number;
  
  // Refresh token rotation
  rotateTokenOnRefresh: boolean;
  
  // Require HTTPS
  httpsOnly: boolean;
  
  // SameSite cookie attribute
  sameSite: "Strict" | "Lax" | "None";
}

// Generate cryptographically secure session ID
import crypto from "crypto";
const generateSessionId = (): string => {
  return `sess_${crypto.randomBytes(32).toString("hex")}`;
};
```

### Password Security
```typescript
import bcrypt from "bcrypt";

// Hash passwords before storage
const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12; // Higher = more secure but slower
  return await bcrypt.hash(password, saltRounds);
};

// Verify password
const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};
```

### Token Management
```typescript
// JWT Configuration
interface JWTConfig {
  secret: string; // Long, random secret
  expiresIn: "24h"; // Short expiration
  algorithm: "HS256";
  issuer: "amtp";
  audience: "agents";
}

// Token validation
const validateToken = (token: string, secret: string): boolean => {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: "amtp",
    });
    return true;
  } catch (error) {
    return false;
  }
};
```

### Permission Checking
```typescript
interface Permission {
  resource: string;
  action: string; // read, write, delete, admin
}

const canExecuteAction = (
  userPermissions: Permission[],
  requiredResource: string,
  requiredAction: string
): boolean => {
  return userPermissions.some(
    (p) => p.resource === requiredResource && p.action === requiredAction
  );
};
```

---

## 3. CSRF Protection

### Token Generation & Validation
```typescript
import crypto from "crypto";

// Generate CSRF token
const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

// CSRF token in forms
const renderForm = (csrfToken: string) => {
  return `
FIELD: _csrf_token
TYPE: hidden
VALUE: ${csrfToken}
`;
};

// Validate CSRF token on POST
const validateCsrfToken = (token: string, sessionCsrf: string): boolean => {
  return token === sessionCsrf && token.length === 64;
};
```

### SameSite Cookie
```typescript
// Express middleware
app.use(
  session({
    cookie: {
      secure: true, // HTTPS only
      httpOnly: true, // No JavaScript access
      sameSite: "strict", // Prevent CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
```

---

## 4. Rate Limiting

### Per-Agent Rate Limiting
```typescript
interface RateLimitConfig {
  requests: number; // 100 requests
  window: "minute" | "hour" | "day"; // Per minute
  burst: number; // Allow 10 burst requests
  keyGenerator: (req: Request) => string; // By session ID or IP
}

// Rate limit middleware
const rateLimitMiddleware = (config: RateLimitConfig) => {
  const store = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = config.keyGenerator(req);
    const now = Date.now();
    const windowMs =
      config.window === "minute"
        ? 60000
        : config.window === "hour"
          ? 3600000
          : 86400000;

    if (!store.has(key)) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const record = store.get(key)!;
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    if (record.count >= config.requests) {
      res.status(429).json({
        status: "error",
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
          retryAfter: Math.ceil(
            (record.resetTime - now) / 1000
          ),
        },
      });
      return;
    }

    record.count++;
    res.set("X-RateLimit-Remaining", String(config.requests - record.count));
    next();
  };
};
```

---

## 5. Encryption & HTTPS

### HTTPS Enforcement
```typescript
// Express middleware
const enforceHttps = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "production") {
    if (req.header("x-forwarded-proto") !== "https") {
      return res.redirect(301, `https://${req.header("host")}${req.url}`);
    }
  }
  next();
};

app.use(enforceHttps);
```

### Data Encryption
```typescript
import crypto from "crypto";

// Encrypt sensitive data
const encryptData = (data: string, encryptionKey: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(encryptionKey), iv);
  
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return iv.toString("hex") + ":" + encrypted;
};

// Decrypt sensitive data
const decryptData = (encrypted: string, encryptionKey: string): string => {
  const [iv, data] = encrypted.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(encryptionKey),
    Buffer.from(iv, "hex")
  );
  
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
};
```

---

## 6. Security Headers

### Recommended Headers
```typescript
// Security headers middleware
const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Disable X-Frame-Options clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // XSS Protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );

  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // HSTS (HTTPS only)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
};

app.use(securityHeaders);
```

---

## 7. Logging & Monitoring

### Security Event Logging
```typescript
interface SecurityEvent {
  timestamp: string;
  type: "auth_success" | "auth_failure" | "unauthorized_action" | "rate_limit";
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  ip: string;
  userAgent: string;
  details?: Record<string, unknown>;
}

const logSecurityEvent = (event: SecurityEvent) => {
  console.log(`[SECURITY] ${event.timestamp} - ${event.type}`, {
    userId: event.userId,
    action: event.action,
    resource: event.resource,
    ip: event.ip,
  });

  // Send to security monitoring service (e.g., Sentry, DataDog)
  // ...
};
```

### Failed Login Tracking
```typescript
// Track failed login attempts
const failedLoginAttempts = new Map<string, { count: number; resetTime: number }>();

const trackFailedLogin = (email: string) => {
  const now = Date.now();
  const record = failedLoginAttempts.get(email) || {
    count: 0,
    resetTime: now + 15 * 60 * 1000, // 15 min window
  };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + 15 * 60 * 1000;
  } else {
    record.count++;
  }

  failedLoginAttempts.set(email, record);

  // Lock account after 5 failed attempts
  if (record.count >= 5) {
    logSecurityEvent({
      timestamp: new Date().toISOString(),
      type: "auth_failure",
      action: "login_locked",
      resource: email,
      ip: "unknown",
      userAgent: "unknown",
      details: { reason: "too_many_failed_attempts" },
    });
  }
};
```

---

## 8. Dependency Security

### Vulnerable Dependencies Scanning
```bash
# Check for known vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Update packages safely
npm update

# Check for outdated packages
npm outdated
```

### Lock File Management
```bash
# Generate package-lock.json
npm ci

# Verify lock file integrity
npm ci --verify-lock-file
```

---

## 9. Configuration Security

### Environment Variables
```bash
# ❌ DON'T commit secrets
DATABASE_PASSWORD=secretpassword
API_KEY=sk_live_abc123

# ✅ DO use .env files (in .gitignore)
# .env (local only)
# .env.example (commit this, with placeholders)
DATABASE_PASSWORD=<your-password>
API_KEY=<your-api-key>
```

### Configuration Loading
```typescript
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(".env") });

// Validate required variables
const required = ["NODE_ENV", "DATABASE_URL", "JWT_SECRET"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

---

## 10. Security Checklist

### Before Production Deployment

- [ ] All inputs validated and sanitized
- [ ] Passwords hashed with bcrypt (12+ rounds)
- [ ] Session IDs generated with crypto.randomBytes
- [ ] HTTPS enforced
- [ ] CSRF tokens on all forms
- [ ] Rate limiting enabled
- [ ] Security headers set
- [ ] Logging configured for security events
- [ ] Failed login tracking enabled
- [ ] Dependencies up to date
- [ ] npm audit passes (no high/critical vulnerabilities)
- [ ] .env files in .gitignore
- [ ] API keys not in code
- [ ] Database credentials not in code
- [ ] CORS properly configured
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output escaping)
- [ ] Authentication required for sensitive actions
- [ ] Authorization checks in place
- [ ] Sensitive data encrypted
- [ ] Audit logs enabled

---

## 11. Security Incident Response

### In Case of Compromise

1. **Immediate Actions**
   - Revoke all active sessions
   - Force password reset for affected users
   - Audit access logs
   - Enable enhanced monitoring

2. **Investigation**
   - Determine scope of compromise
   - Check for data exfiltration
   - Review security logs
   - Identify vulnerability

3. **Remediation**
   - Patch vulnerability
   - Update all systems
   - Rotate credentials
   - Deploy fix

4. **Communication**
   - Notify affected users
   - Provide guidance (reset passwords, etc.)
   - Offer credit monitoring if applicable
   - Publish incident report

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Security is not optional - it's essential for production systems.**
