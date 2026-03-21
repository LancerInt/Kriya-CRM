"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/axios";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Link from "next/link";

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/clients/${id}/`),
      api.get(`/clients/${id}/timeline/`).catch(() => ({ data: [] })),
    ])
      .then(([clientRes, timelineRes]) => {
        setClient(clientRes.data);
        setTimeline(timelineRes.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!client) return <p className="text-center text-gray-500 py-8">Client not found</p>;

  return (
    <div>
      <PageHeader
        title={client.company_name}
        subtitle={`${client.country || "\u2014"} \u00b7 ${client.business_type || "\u2014"}`}
        action={
          <Link
            href={`/clients/${id}/edit`}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            Edit Client
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Card */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Client Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Status:</span> <StatusBadge status={client.status} /></div>
            <div><span className="text-gray-500">Country:</span> <span className="ml-1">{client.country || "\u2014"}</span></div>
            <div><span className="text-gray-500">City:</span> <span className="ml-1">{client.city || "\u2014"}</span></div>
            <div><span className="text-gray-500">Business Type:</span> <span className="ml-1">{client.business_type || "\u2014"}</span></div>
            <div><span className="text-gray-500">Delivery Terms:</span> <span className="ml-1">{client.delivery_terms}</span></div>
            <div><span className="text-gray-500">Currency:</span> <span className="ml-1">{client.preferred_currency}</span></div>
            <div><span className="text-gray-500">Credit Days:</span> <span className="ml-1">{client.credit_days}</span></div>
            <div><span className="text-gray-500">Credit Limit:</span> <span className="ml-1">${Number(client.credit_limit).toLocaleString()}</span></div>
            <div className="sm:col-span-2"><span className="text-gray-500">Address:</span> <span className="ml-1">{client.address || "\u2014"}</span></div>
            {client.website && (
              <div className="sm:col-span-2"><span className="text-gray-500">Website:</span> <a href={client.website} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline">{client.website}</a></div>
            )}
          </div>

          {/* Contacts */}
          {client.contacts && client.contacts.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium mb-3">Contacts</h4>
              <div className="space-y-2">
                {client.contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{c.name} {c.is_primary && <span className="text-xs text-indigo-600">(Primary)</span>}</p>
                      <p className="text-xs text-gray-500">{c.designation} &middot; {c.email}</p>
                    </div>
                    <p className="text-xs text-gray-500">{c.phone}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Activity Timeline</h3>
          {timeline.length > 0 ? (
            <div className="space-y-4">
              {timeline.slice(0, 20).map((item, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-indigo-400 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-700">{item.description || item.type}</p>
                    <p className="text-xs text-gray-400">{new Date(item.created_at || item.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No activity yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
