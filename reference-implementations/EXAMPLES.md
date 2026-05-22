# E-Commerce Checkout Example

## AMTP Implementation for Product Page & Checkout Flow

### Example 1: Product Detail Page Response

**Request:**
```http
GET /products/mbp-14-2024
Accept: text/amtp+markdown
X-AMTP-Capabilities: actions,streaming,forms,pagination
X-Session-ID: sess_user123
```

**Response:**
```markdown
# MacBook Pro 14" (2024)

The most powerful laptop for creative professionals and developers.

## Product Information

**Brand:** Apple  
**Model:** MacBook Pro 14-inch M3 Pro  
**Release:** May 2024  
**Color:** Space Gray (selected), also available in Silver, Midnight  

## Price & Stock

Price: $1,999.00 USD  
Sale Price: $1,899.00 (5% off - Limited Time)  
In Stock: Yes (7 units remaining)  
Ships: 1-2 business days  

## Key Specifications

| Spec | Details |
|------|---------|
| Processor | Apple M3 Pro (12-core CPU, 18-core GPU) |
| Memory | 18GB Unified Memory |
| Storage | 512GB SSD |
| Display | 14.2-inch Liquid Retina XDR, 3200×2000, 120Hz |
| Battery | 17-hour battery life |
| Ports | 3x Thunderbolt 4, HDMI 2.1, SD UHS-II, 3.5mm audio |
| Weight | 3.5 lbs (1.6 kg) |

## Actions

[BUY_NOW] - Purchase immediately
[ADD_TO_CART] - Add to shopping cart
[COMPARE_MODELS] - Compare with other MacBooks
[READ_REVIEWS] - Read customer reviews (12,450 reviews, 4.8/5)
[SAVE_FOR_LATER] - Save to wishlist
[SHARE] - Share with friends

## Customer Reviews

### ⭐⭐⭐⭐⭐ "Best Investment Ever" — Sarah M.
"Upgraded from M1 Pro. The M3 Pro is lightning fast. Worth every penny."

### ⭐⭐⭐⭐ "Great Machine, Premium Price" — John D.
"Excellent performance. Would have liked more base storage."

## Related Products

- [MacBook Air 13" M3](/products/mba-13-m3) — $1,299
- [Mac Studio](/products/mac-studio) — $1,999
- [Mac Mini M3](/products/mac-mini-m3) — $599
- [Magic Keyboard](/accessories/keyboard) — $299
- [USB-C Cable 2m](/accessories/usb-c-cable) — $19

## Financing Options

[APPLY_FOR_FINANCING] - Pay in 12 monthly installments  
[TRADE_IN_ESTIMATE] - Get credit for your old laptop  

## Support & Warranty

- 1-year limited warranty included
- AppleCare+ available: $379
- 30-day money-back guarantee

## Metadata

```amtp-meta
{
  "pageId": "product-mbp14-2024",
  "pageType": "product",
  "productId": "MPHE3LL/A",
  "sku": "MBP14M3PRO512",
  "version": "1.0",
  "lastUpdated": "2024-05-22T10:30:00Z",
  "cacheControl": "max-age=3600",
  "sessionRequired": false
}
```

```amtp-data
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "MacBook Pro 14\" (2024)",
  "description": "High-performance laptop for creative professionals",
  "sku": "MBP14M3PRO512",
  "mpn": "MPHE3LL/A",
  "brand": {
    "@type": "Brand",
    "name": "Apple"
  },
  "offers": {
    "@type": "Offer",
    "price": "1899.00",
    "priceCurrency": "USD",
    "availability": "InStock",
    "inventoryLevel": 7,
    "url": "https://example.com/products/mbp-14-2024"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.8,
    "bestRating": 5,
    "worstRating": 1,
    "ratingCount": 12450,
    "reviewCount": 12450
  },
  "image": [
    "https://cdn.example.com/products/mbp14-2024-1.jpg",
    "https://cdn.example.com/products/mbp14-2024-2.jpg"
  ]
}
```

---

### Example 2: Shopping Cart Page

**Request:**
```http
GET /cart
Accept: text/amtp+markdown
X-Session-ID: sess_user123
```

**Response:**
```markdown
# Shopping Cart

Your Cart (3 items) | Total: $3,498.00

## Items in Cart

### 1. MacBook Pro 14" M3 Pro (512GB)
Price: $1,899.00  
Quantity: 1  
Actions: [REMOVE] [SAVE_FOR_LATER] [UPDATE_QUANTITY]

### 2. Magic Keyboard
Price: $299.00  
Quantity: 1  
Actions: [REMOVE] [SAVE_FOR_LATER] [UPDATE_QUANTITY]

### 3. AppleCare+ for MacBook
Price: $379.00  
Quantity: 1  
Actions: [REMOVE] [SAVE_FOR_LATER] [UPDATE_QUANTITY]

## Order Summary

Subtotal: $2,577.00  
Shipping: $0.00 (Free)  
Tax (estimated): $206.16  
**Total: $2,783.16**  

## Estimated Delivery

Next business day delivery available in your area

## Actions

[CONTINUE_SHOPPING] - Browse more products
[APPLY_COUPON] - Enter discount code
[PROCEED_TO_CHECKOUT] - Begin checkout process

## Saved for Later

You have 2 items saved for later:
- iPad Pro 12.9"
- AirPods Pro

[VIEW_SAVED_ITEMS]

```

---

### Example 3: Checkout Form

**Request:**
```http
GET /checkout
Accept: text/amtp+markdown
X-Session-ID: sess_user123
```

**Response:**
```markdown
# Checkout - Step 1 of 3: Shipping

## Shipping Address

ACTION: update_shipping_address
METHOD: POST
ENDPOINT: /api/checkout/shipping

FIELD: fullname
TYPE: text
LABEL: Full Name
REQUIRED: true
PLACEHOLDER: John Doe

FIELD: email
TYPE: email
LABEL: Email Address
REQUIRED: true
PLACEHOLDER: john@example.com

FIELD: address
TYPE: text
LABEL: Street Address
REQUIRED: true
PLACEHOLDER: 123 Main St

FIELD: city
TYPE: text
LABEL: City
REQUIRED: true

FIELD: state
TYPE: select
LABEL: State
REQUIRED: true
OPTIONS: CA,NY,TX,FL,IL,PA,OH,GA,NC,MI

FIELD: zipcode
TYPE: text
LABEL: ZIP Code
REQUIRED: true
PLACEHOLDER: 90210

FIELD: country
TYPE: select
LABEL: Country
REQUIRED: true
OPTIONS: United States,Canada,United Kingdom

FIELD: phone
TYPE: tel
LABEL: Phone Number
REQUIRED: true
PLACEHOLDER: (555) 123-4567

## Shipping Method

ACTION: select_shipping_method
METHOD: POST
ENDPOINT: /api/checkout/shipping-method

FIELD: method
TYPE: radio
LABEL: Shipping Method
REQUIRED: true
OPTIONS: standard,express,overnight

Standard (3-5 days): Free  
Express (1-2 days): $25  
Overnight: $50  

## Navigation

[← BACK_TO_CART]
[NEXT_PAYMENT_METHOD →]

```

---

### Example 4: Payment Processing Action

**Request:**
```http
POST /api/amtp/action
Content-Type: application/json
X-Session-ID: sess_user123

{
  "action": "process_payment",
  "paymentMethod": "credit_card",
  "cardToken": "tok_visa_abc123",
  "billingAddress": {
    "fullname": "John Doe",
    "address": "123 Main St",
    "city": "Los Angeles",
    "state": "CA",
    "zipcode": "90210"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "action": "process_payment",
  "result": {
    "orderId": "ord_xyz789",
    "orderNumber": "#ORD-2024-5022",
    "totalPrice": 2783.16,
    "paymentStatus": "completed",
    "estimatedDelivery": "2024-05-23",
    "trackingUrl": "/orders/ord_xyz789/tracking",
    "confirmationEmailSent": true,
    "confirmationTimestamp": "2024-05-22T10:30:00Z"
  },
  "next_actions": [
    "VIEW_ORDER_CONFIRMATION",
    "TRACK_SHIPMENT",
    "DOWNLOAD_INVOICE",
    "CONTINUE_SHOPPING"
  ],
  "redirect_to": "/orders/ord_xyz789"
}
```

---

### Example 5: Streaming Updates - Order Status

**Request:**
```http
GET /api/amtp/stream/orders/ord_xyz789
Accept: text/event-stream
X-Session-ID: sess_user123
```

**Streaming Response:**
```
event: order_confirmed
data: {"message": "Order confirmed", "orderNumber": "#ORD-2024-5022"}

event: payment_processed  
data: {"message": "Payment processed successfully", "method": "Visa ending in 4242"}

event: items_packed
data: {"message": "Items packed and ready to ship", "trackingNumber": "TRK1234567890"}

event: shipment_dispatched
data: {"message": "Order shipped", "carrier": "FedEx", "trackingNumber": "TRK1234567890", "estimatedDelivery": "2024-05-23"}

event: out_for_delivery
data: {"message": "Package out for delivery", "carrierEstimate": "Today by 8:00 PM"}

event: delivered
data: {"message": "Package delivered", "deliveredTime": "2024-05-23T17:45:00Z"}
```

---

### Example 6: SaaS Dashboard

**Request:**
```http
GET /dashboard
Accept: text/amtp+markdown
X-Session-ID: sess_agent_analytics
```

**Response:**
```markdown
# Analytics Dashboard

Welcome back, Acme Corp Sales Team!

## Key Metrics (This Month)

| Metric | Value | Change |
|--------|-------|--------|
| Revenue | $145,320 | ↑ 12% |
| Orders | 324 | ↑ 8% |
| Customers | 156 | ↑ 5% |
| Avg Order Value | $448 | ↑ 3% |

## Recent Orders

```amtp-data
{
  "@type": "Order",
  "orders": [
    {
      "orderNumber": "#2024-5019",
      "customer": "Tech Corp Inc",
      "amount": 12500,
      "status": "delivered",
      "date": "2024-05-21"
    },
    {
      "orderNumber": "#2024-5018",
      "customer": "StartUp Labs",
      "amount": 8900,
      "status": "shipped",
      "date": "2024-05-20"
    },
    {
      "orderNumber": "#2024-5017",
      "customer": "Enterprise Co",
      "amount": 25000,
      "status": "processing",
      "date": "2024-05-19"
    }
  ]
}
```

## Actions

[VIEW_DETAILED_ANALYTICS] - Open full analytics
[EXPORT_REPORT] - Download monthly report
[MANAGE_SETTINGS] - Account settings
[LOGOUT] - End session

```

---

### Example 7: AI Search Engine Integration

**Request:**
```http
GET /api/search?q=macbook+pro&limit=20
Accept: text/amtp+markdown
X-Agent-Identity: {
  "agent_id": "search_crawler_v1",
  "organization": "search_engine",
  "capabilities": ["crawling", "indexing"]
}
```

**Response:**
```markdown
# Search Results for "macbook pro"

Results: 1,247 | Page 1 of 62

## Result 1: MacBook Pro 14" (2024)

```amtp-data
{
  "@type": "Product",
  "name": "MacBook Pro 14\" (2024)",
  "url": "https://example.com/products/mbp-14-2024",
  "price": {
    "currency": "USD",
    "amount": 1899
  },
  "rating": {
    "ratingValue": 4.8,
    "reviewCount": 12450
  },
  "inStock": true
}
```

```amtp-embeddings
{
  "model": "text-embedding-3-large",
  "dimension": 3072,
  "vector": [0.0234, -0.0123, 0.5678, ...]
}
```

```amtp-citation
{
  "source": "example.com",
  "verified": true,
  "authority_score": 0.95,
  "freshness": "current"
}
```

High-performance laptop with M3 Pro chip, excellent for developers...

[LEARN_MORE](/products/mbp-14-2024)

---

## Result 2: MacBook Air 13"

...similar format...

---

## Pagination

[← Previous](/search?q=macbook+pro&page=0)  
[Next →](/search?q=macbook+pro&page=2)  
Page 1 of 62
```

---

These examples demonstrate AMTP in action across multiple real-world scenarios, showing how agents can navigate, submit forms, track state, and handle streaming updates — all through semantic markdown without requiring DOM rendering or JavaScript.
