"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/axios";
import StatusBadge from "@/components/ui/StatusBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

export default function CommunicationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [comm, setComm] = useState(null);
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/communications/${id}/thread/`)
      .then((res) => {
        setComm(res.data.communication);
        setThread(res.data.thread || []);
      })
      .catch((err) => { toast.error(getErrorMessage(err, "Failed to load")); router.push("/communications"); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!comm) return null;

  const isCurrentMsg = (msg) => msg.id === comm.id;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/communications")} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{comm.subject || "(No Subject)"}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={comm.comm_type} />
            {comm.client_name && <span className="text-sm text-gray-500">{comm.client_name}</span>}
            {thread.length > 1 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{thread.length} messages in thread</span>}
          </div>
        </div>
      </div>

      {/* Thread */}
      <div className="space-y-4">
        {thread.map((msg, i) => (
          <div key={msg.id} className={`bg-white rounded-xl border overflow-hidden ${isCurrentMsg(msg) ? "border-indigo-300 ring-1 ring-indigo-100" : "border-gray-200"}`}>
            {/* Message header */}
            <div className={`px-5 py-3 border-b ${msg.direction === "inbound" ? "bg-blue-50/50 border-blue-100" : "bg-green-50/50 border-green-100"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${msg.direction === "inbound" ? "bg-blue-500" : "bg-green-500"}`}>
                      {msg.direction === "inbound" ? (msg.external_email || "?")[0].toUpperCase() : "K"}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {msg.direction === "inbound"
                          ? (msg.contact_name || msg.external_email || msg.external_phone || "Unknown sender")
                          : (msg.user_name || "Kriya CRM")}
                      </p>
                      <p className="text-xs text-gray-500">
                        {msg.direction === "inbound" ? "to me" : `to ${msg.external_email || msg.external_phone || "—"}`}
                        {msg.email_cc && <span className="ml-1">cc: {msg.email_cc}</span>}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {(() => { try { return format(new Date(msg.created_at), "MMM d, yyyy h:mm a"); } catch { return "—"; } })()}
                  </p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${msg.direction === "inbound" ? "text-blue-700 bg-blue-100" : "text-green-700 bg-green-100"}`}>
                    {msg.direction === "inbound" ? "Received" : "Sent"}
                  </span>
                </div>
              </div>
            </div>

            {/* Message body */}
            <div className="px-5 py-4">
              {msg.comm_type === "email" && msg.body?.includes("<") ? (
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: msg.body }} />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.body || "No content"}</p>
              )}
            </div>

            {/* Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs font-medium text-gray-500 mb-2">Attachments ({msg.attachments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {msg.attachments.map((att) => (
                    <a key={att.id} href={att.file} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      <span className="text-xs font-medium text-gray-700">{att.filename}</span>
                      <span className="text-[10px] text-gray-400">{(att.file_size / 1024).toFixed(1)} KB</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {msg.ai_summary && (
              <div className="px-5 py-3 border-t border-gray-100">
                <div className="flex items-center gap-1 mb-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  <span className="text-xs font-medium text-indigo-600">AI Summary</span>
                </div>
                <p className="text-sm text-gray-600 bg-indigo-50 rounded-lg p-3">{msg.ai_summary}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Thread info */}
      {thread.length > 1 && (
        <div className="mt-4 text-center">
          <span className="text-xs text-gray-400">{thread.length} messages in this conversation</span>
        </div>
      )}
    </div>
  );
}
