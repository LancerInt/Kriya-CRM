/**
 * Extracts a human-readable error message from an Axios error response.
 * DRF returns errors in formats like:
 *   { "title": ["This field is required."] }
 *   { "detail": "Not found." }
 *   { "error": "Something went wrong" }
 *   { "non_field_errors": ["Invalid data."] }
 */
export function getErrorMessage(err, fallback = "Something went wrong") {
  if (!err?.response?.data) return fallback;
  const data = err.response.data;

  // String error
  if (typeof data === "string") return data;

  // { error: "message" }
  if (data.error) return data.error;

  // { detail: "message" }
  if (data.detail) return data.detail;

  // { non_field_errors: ["message"] }
  if (data.non_field_errors) return data.non_field_errors.join(". ");

  // Field-level errors: { field_name: ["error message"] }
  const fieldLabels = {
    title: "Title", description: "Description", client: "Client", owner: "Assign To",
    email: "Email", username: "Username", password: "Password", first_name: "First Name",
    last_name: "Last Name", company_name: "Company Name", country: "Country",
    subject: "Subject", body: "Body", content: "Content", message: "Message",
    scheduled_at: "Scheduled At", agenda: "Agenda", platform: "Platform",
    due_date: "Due Date", priority: "Priority", status: "Status",
    phone: "Phone", whatsapp: "WhatsApp", designation: "Designation",
    name: "Name", email_account: "Email Account", to: "To",
    shipment: "Shipment", order: "Order", product: "Product",
    quantity: "Quantity", unit_price: "Unit Price", amount: "Amount",
    invoice: "Invoice", currency: "Currency", delivery_terms: "Delivery Terms",
    inspection_date: "Inspection Date", inspector_name: "Inspector Name",
    file: "File", meeting_link: "Meeting Link", api_key: "API Key",
    phone_number_id: "Phone Number ID", business_account_id: "Business Account ID",
    access_token: "Access Token", verify_token: "Verify Token",
    imap_host: "IMAP Host", smtp_host: "SMTP Host",
    old_password: "Current Password", new_password: "New Password",
    quotation: "Quotation", inquiry: "Inquiry", items: "Line Items",
  };

  const errors = [];
  for (const [field, msgs] of Object.entries(data)) {
    if (Array.isArray(msgs)) {
      const label = fieldLabels[field] || field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      msgs.forEach((msg) => {
        if (msg === "This field is required." || msg === "This field may not be blank.") {
          errors.push(`${label} is required`);
        } else if (msg === "This field may not be null.") {
          errors.push(`${label} is required`);
        } else if (msg.includes("already exists")) {
          errors.push(`${label} already exists`);
        } else if (msg.includes("valid")) {
          errors.push(`Enter a valid ${label.toLowerCase()}`);
        } else {
          errors.push(`${label}: ${msg}`);
        }
      });
    } else if (typeof msgs === "string") {
      const label = fieldLabels[field] || field;
      errors.push(`${label}: ${msgs}`);
    }
  }

  return errors.length > 0 ? errors.join(". ") : fallback;
}
