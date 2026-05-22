# Checkout - Shipping Information

Please provide your shipping details to continue with your order.

## Shipping Address Form
ACTION: submit_shipping
METHOD: POST
ENDPOINT: /api/checkout/shipping

FIELD: full_name
  TYPE: text
  LABEL: Full Name
  REQUIRED: true
  PLACEHOLDER: John Appleseed

FIELD: email
  TYPE: email
  LABEL: Email Address
  REQUIRED: true
  PLACEHOLDER: you@example.com

FIELD: address_line1
  TYPE: text
  LABEL: Street Address
  REQUIRED: true

FIELD: city
  TYPE: text
  LABEL: City
  REQUIRED: true

FIELD: country
  TYPE: select
  LABEL: Country
  REQUIRED: true
  OPTIONS: United States, Canada, United Kingdom, Germany, India, Australia

FIELD: postal_code
  TYPE: text
  LABEL: Postal Code
  REQUIRED: true
  MAX_LENGTH: 12

## Actions

[CONTINUE_TO_PAYMENT] - Proceed to payment method selection
[CANCEL] - Return to cart

```amtp-meta
{
  "orderId": "ord_9k2p1m",
  "step": "shipping",
  "total": 2147.98
}
```
