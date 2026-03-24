# WhatsApp Templates Reference

Below are the exact templates you should create in your Meta WhatsApp Manager. Be sure to map the EXACT template titles (names) shown below, and ensure the body message includes the `{{1}}` and `{{2}}` variables.

---

### 1. Order Processing
**Template Name:** `order_processing_template`
**Parameters Required:**
- `{{1}}` = Customer First Name
- `{{2}}` = Order Number

**Template Body:**
> "Hi {{1}}, 
> 
> Great news! Your order {{2}} has been confirmed and is now being processed. We will notify you once it has been shipped. 
> 
> Thank you for shopping with Pothpancha!"

---

### 2. Order On Hold (Bank Transfer)
**Template Name:** `order_onhold_template`
**Parameters Required:**
- `{{1}}` = Customer First Name
- `{{2}}` = Order Number

**Template Body:**
> "Hello {{1}}, 
> 
> We have received your order {{2}}. Because you selected Bank Transfer, your order is currently on hold.
> 
> Please transfer the total amount to our bank account and reply to this message with the transfer slip to process your order. 
> 
> Thank you!"

---

### 3. Order Completed
**Template Name:** `order_completed_template`
**Parameters Required:**
- `{{customer_name}}` = Customer First Name
- `{{order_id}}` = Order Number

**Template Body:**
> "Hi {{customer_name}},
>
>Your order #{{order_id}} has been completed and dispatched for delivery. You will receive it within 5 business days.
>
>We hope you enjoy your purchase from Pothpancha!"

---

### 4. Order Cancelled
**Template Name:** `order_cancelled_template`
**Parameters Required:**
- `{{1}}` = Customer First Name
- `{{2}}` = Order Number

**Template Body:**
> "Hi {{1}}, 
> 
> We wanted to let you know that your order {{2}} has been cancelled. 
> 
> If you have any questions or if this was a mistake, please reply to this message and our support team will help you."

---

### 5. Order Failed
**Template Name:** `order_failed_template`
**Parameters Required:**
- `{{1}}` = Customer First Name
- `{{2}}` = Order Number

**Template Body:**
> "Hello {{1}}, 
> 
> Unfortunately, the payment for your order {{2}} failed and the order could not be processed. 
> 
> Please try placing the order again using a different payment method. Let us know if you need assistance!"
