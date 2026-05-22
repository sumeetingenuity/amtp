# AMTP Markdown Grammar Specification

## Formal Grammar (EBNF)

```ebnf
(* AMTP Document Grammar *)

DOCUMENT = HEADING section* EOF

section = HEADING2 content*
        | HEADING3 content*

content = paragraph
        | action_list
        | form
        | link_section
        | table
        | code_block
        | metadata_block
        | list

(* Headings *)
HEADING = "#" " " inline_text
HEADING2 = "##" " " inline_text
HEADING3 = "###" " " inline_text

(* Inline Text *)
inline_text = (plain_text | emphasis | code | link)*
plain_text = { [^ \n\[\]\*\`\# ] }+
emphasis = ("**" inline_text "**") | ("*" inline_text "*")
code = "`" [^ ` ]+ "`"

(* Actions *)
action_list = (ACTION)+
ACTION = "[" ACTION_NAME "]" description?
ACTION_NAME = { [A-Z_0-9] }+
description = "-" plain_text

(* Forms *)
form = form_header field*
form_header = "ACTION:" form_name "METHOD:" HTTP_METHOD "ENDPOINT:" URL
form_name = { [A-Za-z_] }+
HTTP_METHOD = "GET" | "POST" | "PUT" | "DELETE"
URL = "https://" { [^ \n ] }+ | "/path/to/endpoint"
field = "FIELD:" field_name field_properties+
field_name = { [A-Za-z_] }+
field_properties = ("TYPE:" FIELD_TYPE) 
                 | ("REQUIRED:" boolean) 
                 | ("LABEL:" plain_text)
                 | ("OPTIONS:" option_list)
FIELD_TYPE = "text" | "email" | "password" | "select" | ...
option_list = option ("," option)*
option = plain_text

(* Links *)
link_section = link+
link = "[" link_text "]" "(" URL ")"
link_text = { [^ \] ] }+

(* Tables *)
table = table_header separator table_row+
table_header = "|" (table_cell "|")+
separator = "|" (":?""-"+":?")+
table_row = "|" (table_cell "|")+
table_cell = { [^ | ] }*

(* Code Blocks *)
code_block = "```" language code_content "```"
language = { [A-Za-z] }*
code_content = { [^ ` ] }+

(* Metadata Blocks *)
metadata_block = AMTP_META | AMTP_DATA | AMTP_ACTIONS
AMTP_META = "```amtp-meta" JSON "```"
AMTP_DATA = "```amtp-data" JSON "```"
AMTP_ACTIONS = "```amtp-actions" JSON "```"
JSON = { JSON_VALID }+

(* Lists *)
list = list_item+
list_item = (BULLET_POINT | ORDERED_POINT) plain_text

BULLET_POINT = "-" | "*"
ORDERED_POINT = digit+ "."

(* Primitives *)
EOF = end_of_file
boolean = "true" | "false"
digit = "0" | "1" | ... | "9"
```

## Examples

### Simple Product Page

```markdown
# MacBook Pro 14"

Powerful laptop for professionals.

## Details

Price: $1,999
Stock: 5 remaining

## Actions

[BUY] - Purchase immediately
[ADD_TO_CART] - Add to cart
[SAVE] - Save for later

**Action Descriptions (recommended for v1.1+)**

The free-text after the `-` provides a natural-language hint for agents:

- Recommended max length: 200–280 characters (for token efficiency)
- Should describe the *purpose* and *expected outcome* of the action
- The parser automatically applies `sanitizeFreeText` to strip common prompt-injection patterns
- Good example: `[CHECKOUT] - Proceed to payment with current cart (idempotent, requires auth)`
- Avoid: long paragraphs or instructions that could be misinterpreted by the LLM

## Specifications

| Component | Spec |
|-----------|------|
| CPU | M3 Pro |
| RAM | 18GB |
| Storage | 512GB |

## Links

- [View Reviews](/reviews)
- [Similar Products](/similar)

```

### Complex Form

```markdown
# Contact Form

## Send us a message

ACTION: contact_form
METHOD: POST
ENDPOINT: /contact/submit

FIELD: fullname
TYPE: text
LABEL: Full Name
REQUIRED: true
PLACEHOLDER: John Doe

FIELD: email
TYPE: email
LABEL: Email Address
REQUIRED: true
VALIDATION: email

FIELD: category
TYPE: select
LABEL: Category
REQUIRED: true
OPTIONS: General,Support,Sales,Bug Report

FIELD: priority
TYPE: select
LABEL: Priority (optional)
OPTIONS: Low,Medium,High

FIELD: message
TYPE: textarea
LABEL: Message
REQUIRED: true
MAX_LENGTH: 5000
PLACEHOLDER: Your message here...

FIELD: subscribe
TYPE: checkbox
LABEL: Subscribe to updates
DEFAULT: false

```

### Product with Metadata

```markdown
# iPhone 15 Pro

Advanced smartphone for demanding users.

```amtp-meta
{
  "pageType": "product",
  "productId": "iphone-15-pro",
  "version": "1.0",
  "lastUpdated": "2024-05-22T10:30:00Z"
}
```

```amtp-data
{
  "@type": "Product",
  "name": "iPhone 15 Pro",
  "description": "Advanced smartphone",
  "price": {
    "currency": "USD",
    "amount": 999
  },
  "rating": {
    "ratingValue": 4.7,
    "reviewCount": 5234
  },
  "inStock": true,
  "sku": "IPHONE15PRO",
  "url": "https://example.com/products/iphone-15-pro"
}
```

## Actions

[BUY]
[ADD_TO_CART]
[COMPARE_MODELS]
[READ_REVIEWS]
```

### Authenticated Workflow

```markdown
# Dashboard

Welcome, agent!

Current State: AUTHENTICATED
Session: sess_abc123

## Your Data

Total Orders: 42
Pending Orders: 3
Account Status: Active

## Actions

[VIEW_ORDERS] - Retrieve the user's order history (read-only, paginated)
[PLACE_NEW_ORDER] - Start the checkout flow for current cart (idempotent after payment)
[ACCOUNT_SETTINGS] - Open user preferences and profile editor
[LOGOUT] - Terminate the current session and invalidate tokens

## Quick Links

- [Recent Orders](/orders?limit=5)
- [Wishlist](/wishlist)
- [Support](/support)
```

## Parsing Strategy

### Two-Pass Parser

**Pass 1: Tokenization**
- Split content into lines
- Identify block types (heading, form, metadata)
- Track nesting level

**Pass 2: AST Building**
- Convert tokens into Abstract Syntax Tree
- Validate schema compliance
- Extract metadata

### Streaming Parser

For large documents, parse incrementally:

```
1. Read chunk
2. If contains complete block → emit
3. If partial → buffer
4. On EOF → emit remaining
```

## Rendering Modes

### For Agents

```
Document → AST → Structured data extraction
Extracts:
- Actions and their parameters
- Forms and fields
- Navigation links
- Metadata
- Pagination info
```

### For HTML

```
Markdown AST → HTML with AMTP-specific styling
- Actions → Buttons
- Forms → Native HTML forms
- Links → Standard links
- Metadata → Hidden meta tags
```

### For JSON

```
Markdown AST → JSON API response
{
  "type": "document",
  "title": "...",
  "sections": [...],
  "actions": [...],
  "forms": [...],
  "links": [...]
}
```

## Error Handling

### Invalid Markdown

```
Input: "[BUY without closing bracket"
Error: SyntaxError at line 5, column 1
Message: "Unclosed bracket in action definition"
Suggestion: "Use format: [ACTION_NAME]"
```

### Invalid Form

```
Input: Form missing required METHOD field
Error: ValidationError in form "checkout_form"
Message: "Required field 'METHOD' missing"
Suggestion: "Add 'METHOD: POST' to form header"
```

### Missing Metadata

```
Input: Form without ENDPOINT
Warning: Form "newsletter_signup" lacks endpoint
Suggestion: "Add 'ENDPOINT: /api/subscribe' for client routing"
```

## Performance Notes

- Parsing time: O(n) where n = document size
- Memory: O(m) where m = AST node count  
- Typical 10KB page: <5ms parse time
- Typical 1MB page: <100ms parse time

Recommended document sizes:
- Small: <100KB (product pages, forms)
- Medium: 100KB-1MB (dashboards, search results)
- Large: >1MB (paginated, consider chunking)

## Backward Compatibility

AMTP markdown is valid CommonMark markdown, allowing:

1. Rendering in standard markdown viewers
2. Fallback to basic markdown if AMTP parser unavailable  
3. Git integration (README, docs)
4. Portability across tools

---

**AMTP grammar balances machine-readability with human-friendly syntax.**
