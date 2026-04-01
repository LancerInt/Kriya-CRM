"use client";
import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { createClient, fetchClients } from "@/store/slices/clientSlice";
import api from "@/lib/axios";
import { ALL_COUNTRIES } from "@/lib/countries";
import PageHeader from "@/components/ui/PageHeader";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";

export default function NewClientPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const [executives, setExecutives] = useState([]);
  const [form, setForm] = useState({
    company_name: "",
    country: "",
    city: "",
    state: "",
    address: "",
    postal_code: "",
    business_type: "",
    website: "",
    delivery_terms: "FOB",
    preferred_currency: "USD",
    credit_days: 30,
    credit_limit: 0,
    payment_mode: "",
    status: "prospect",
    primary_executive: "",
    shadow_executive: "",
    notes: "",
    contacts: [{ name: "", email: "", phone: "", designation: "", is_primary: true }],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/auth/users/").then((r) => {
      const users = r.data.results || r.data;
      setExecutives(users);
    }).catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleContactChange = (i, e) => {
    const contacts = [...form.contacts];
    contacts[i] = { ...contacts[i], [e.target.name]: e.target.value };
    setForm({ ...form, contacts });
  };

  const addContact = () => {
    setForm({ ...form, contacts: [...form.contacts, { name: "", email: "", phone: "", designation: "", is_primary: false }] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate: at least the first contact must have a name
    const hasContactName = form.contacts.some((c) => c.name.trim());
    if (!hasContactName) {
      toast.error("Please add at least one contact person name for this account");
      // Focus on the first contact name field
      const nameInput = document.querySelector('input[name="name"][placeholder="Contact Person Name *"]');
      if (nameInput) nameInput.focus();
      return;
    }

    // Filter out empty contacts (no name)
    const validContacts = form.contacts.filter((c) => c.name.trim());
    if (validContacts.length === 0) {
      toast.error("Please add at least one contact person name");
      return;
    }

    setSubmitting(true);
    try {
      const submitData = { ...form, contacts: validContacts };
      if (!submitData.primary_executive) delete submitData.primary_executive;
      if (!submitData.shadow_executive) delete submitData.shadow_executive;
      await dispatch(createClient(submitData)).unwrap();
      toast.success("Account created successfully");
      dispatch(fetchClients());
      router.push("/clients");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create account")); } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Account" />
      <form onSubmit={handleSubmit} className="max-w-3xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h3 className="font-semibold">Company Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <input name="company_name" value={form.company_name} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
              <select name="country" value={form.country} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                <option value="">Select country</option>
                {ALL_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input name="city" value={form.city} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
              <input name="business_type" value={form.business_type} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Owner *</label>
              <select name="primary_executive" value={form.primary_executive} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                <option value="">Select account owner</option>
                {executives.map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Owner</label>
              <select name="shadow_executive" value={form.shadow_executive} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                <option value="">Select secondary owner</option>
                {executives.filter((u) => u.id !== form.primary_executive).map((u) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input name="website" value={form.website} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms</label>
              <select name="delivery_terms" value={form.delivery_terms} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="CFR">CFR</option>
                <option value="EXW">EXW</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select name="preferred_currency" value={form.preferred_currency} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Days</label>
              <input type="number" name="credit_days" value={form.credit_days} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea name="address" value={form.address} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
          </div>

          <h3 className="font-semibold pt-4 border-t">Contact Person <span className="text-red-500">*</span></h3>
          <p className="text-xs text-gray-400 -mt-4">Every account must have at least one contact person</p>
          {form.contacts.map((contact, i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              {i === 0 && <p className="text-xs text-indigo-600 font-medium">Primary Contact</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person Name *</label>
                  <input name="name" placeholder="Contact Person Name *" value={contact.name} onChange={(e) => handleContactChange(i, e)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input name="email" placeholder="Email" value={contact.email} onChange={(e) => handleContactChange(i, e)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input name="phone" placeholder="Phone" value={contact.phone} onChange={(e) => handleContactChange(i, e)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Designation</label>
                  <input name="designation" placeholder="Designation" value={contact.designation} onChange={(e) => handleContactChange(i, e)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addContact} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">+ Add another contact</button>

          <div className="flex gap-3 pt-4 border-t">
            <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Creating..." : "Create Account"}
            </button>
            <button type="button" onClick={() => router.back()} className="px-6 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
