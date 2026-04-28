"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";
import api from "@/lib/axios";
import { getErrorMessage } from "@/lib/errorHandler";

function fmtDateTime(d) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy h:mm a"); } catch { return "—"; }
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [inviteDraft, setInviteDraft] = useState(null); // { meetingId, subject, to, cc, body, sending }
  const [form, setForm] = useState({
    client: "", scheduled_at: "", agenda: "", call_notes: "",
    duration_minutes: "", status: "scheduled",
    platform: "google_meet", meeting_link: "",
  });

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const res = await api.get("/meetings/");
      setMeetings(res.data.results || res.data);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to load meetings")); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchMeetings();
    api.get("/clients/").then((r) => setClients(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.duration_minutes) delete payload.duration_minutes;
      if (!payload.meeting_link) delete payload.meeting_link;
      await api.post("/meetings/", payload);
      toast.success("Meeting scheduled");
      setShowModal(false);
      setForm({ client: "", scheduled_at: "", agenda: "", call_notes: "", duration_minutes: "", status: "scheduled", platform: "google_meet", meeting_link: "" });
      fetchMeetings();
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create meeting")); }
  };

  const handleUpdateMeeting = async (meetingId, updates) => {
    try {
      await api.patch(`/meetings/${meetingId}/`, updates);
      toast.success("Meeting updated");
      fetchMeetings();
      setSelectedMeeting((prev) => ({ ...prev, ...updates }));
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
  };

  const isUpcoming = (row) => row.status === "scheduled" && new Date(row.scheduled_at) > new Date();

  const columns = [
    { key: "platform", label: "Platform", render: (row) => <StatusBadge status={row.platform || "other"} /> },
    { key: "client_name", label: "Client", render: (row) => <span className="font-medium">{row.client_name || "—"}</span> },
    { key: "agenda", label: "Agenda", render: (row) => row.agenda || "—" },
    { key: "scheduled_at", label: "Scheduled", render: (row) => fmtDateTime(row.scheduled_at) },
    { key: "duration_minutes", label: "Duration", render: (row) => row.duration_minutes ? `${row.duration_minutes} min` : "—" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "meeting_link", label: "", render: (row) => {
      if (row.status === "completed" || row.status === "cancelled" || row.status === "missed") {
        return <span className="text-xs text-gray-400 font-medium">{row.status === "completed" ? "Meet Ended" : row.status === "cancelled" ? "Cancelled" : "Missed"}</span>;
      }
      if (row.meeting_link) {
        // Check if meeting time has passed (scheduled_at + duration)
        const endTime = new Date(new Date(row.scheduled_at).getTime() + (row.duration_minutes || 60) * 60000);
        if (new Date() > endTime) {
          return <span className="text-xs text-gray-400 font-medium">Meet Ended</span>;
        }
        return <a href={row.meeting_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Join</a>;
      }
      if (row.platform === "zoom" || row.platform === "google_meet") {
        return <button
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const r = await api.post(`/meetings/${row.id}/generate-link/`);
              toast.success("Link generated — review the draft before sending");
              fetchMeetings();
              const d = r.data?.draft || {};
              setInviteDraft({
                meetingId: row.id,
                subject: d.subject || "",
                to: d.to || "",
                cc: Array.isArray(d.cc) ? d.cc.join(", ") : (d.cc || ""),
                body: d.body_html || "",
                sending: false,
              });
            } catch (err) {
              toast.error(err.response?.data?.error || "Failed to generate link");
            }
          }}
          className="text-xs text-green-600 hover:text-green-700 font-medium"
        >Generate Link</button>;
      }
      return null;
    }},
    { key: "actions", label: "", render: (row) => (
      <div className="flex items-center gap-2">
        {row.status === "scheduled" && (
          <select
            value={row.status}
            onClick={(e) => e.stopPropagation()}
            onChange={async (e) => {
              e.stopPropagation();
              const newStatus = e.target.value;
              try {
                await api.patch(`/meetings/${row.id}/`, { status: newStatus });
                toast.success(`Meeting marked as ${newStatus}`);
                fetchMeetings();
              } catch (err) { toast.error(getErrorMessage(err, "Failed to update status")); }
            }}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
        <button onClick={(e) => { e.stopPropagation(); setSelectedMeeting(row); }} className="px-3 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">Details</button>
      </div>
    )},
  ];

  const sortedMeetings = [...meetings].sort((a, b) => {
    const aUp = isUpcoming(a), bUp = isUpcoming(b);
    if (aUp && !bUp) return -1;
    if (!aUp && bUp) return 1;
    return new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0);
  });

  return (
    <div>
      <PageHeader
        title="Meetings & Calls"
        subtitle={`${meetings.length} meetings`}
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + Schedule Meeting
          </button>
        }
      />

      {sortedMeetings.some(isUpcoming) && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-800">
            {sortedMeetings.filter(isUpcoming).length} upcoming meeting{sortedMeetings.filter(isUpcoming).length !== 1 ? "s" : ""} scheduled
          </p>
        </div>
      )}

      <DataTable columns={columns} data={sortedMeetings} loading={loading} emptyTitle="No meetings yet" emptyDescription="Schedule your first meeting" />

      {/* Create Meeting Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Schedule Meeting" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Select</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform *</label>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="teams">Microsoft Teams</option>
                <option value="whatsapp">WhatsApp Video</option>
                <option value="phone">Phone Call</option>
                <option value="in_person">In Person</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled At *</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
              <input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} placeholder="https://meet.google.com/abc-defg-hij" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agenda *</label>
            <input value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.call_notes} onChange={(e) => setForm({ ...form, call_notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Schedule</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Meeting Detail Modal */}
      <Modal open={!!selectedMeeting} onClose={() => setSelectedMeeting(null)} title={selectedMeeting?.agenda || "Meeting Details"} size="lg">
        {selectedMeeting && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500 block text-xs">Platform</span><StatusBadge status={selectedMeeting.platform} /></div>
              <div><span className="text-gray-500 block text-xs">Client</span><span className="font-medium">{selectedMeeting.client_name}</span></div>
              <div><span className="text-gray-500 block text-xs">Status</span><StatusBadge status={selectedMeeting.status} /></div>
              <div><span className="text-gray-500 block text-xs">Scheduled</span><span className="font-medium">{fmtDateTime(selectedMeeting.scheduled_at)}</span></div>
              {selectedMeeting.duration_minutes && <div><span className="text-gray-500 block text-xs">Duration</span><span className="font-medium">{selectedMeeting.duration_minutes} min</span></div>}
              {selectedMeeting.user_name && <div><span className="text-gray-500 block text-xs">Host</span><span className="font-medium">{selectedMeeting.user_name}</span></div>}
            </div>

            {selectedMeeting.meeting_link && (
              <div>
                <span className="text-gray-500 block text-xs mb-1">Meeting Link</span>
                <a href={selectedMeeting.meeting_link} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline break-all">{selectedMeeting.meeting_link}</a>
              </div>
            )}

            {selectedMeeting.call_notes && (
              <div>
                <span className="text-gray-500 block text-xs mb-1">Notes</span>
                <p className="text-sm bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{selectedMeeting.call_notes}</p>
              </div>
            )}

            {/* Post-meeting editable sections */}
            <div className="border-t border-gray-200 pt-4 space-y-4">
              <h4 className="font-semibold text-sm">Post-Meeting</h4>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Summary / Key Decisions</label>
                <textarea defaultValue={selectedMeeting.summary || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.summary || "")) handleUpdateMeeting(selectedMeeting.id, { summary: e.target.value }); }} rows={3} placeholder="Add meeting summary..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Follow-up Actions</label>
                <textarea defaultValue={selectedMeeting.follow_up_actions || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.follow_up_actions || "")) handleUpdateMeeting(selectedMeeting.id, { follow_up_actions: e.target.value }); }} rows={3} placeholder="Action items from this meeting..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Recording URL</label>
                <input type="url" defaultValue={selectedMeeting.recording_url || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.recording_url || "")) handleUpdateMeeting(selectedMeeting.id, { recording_url: e.target.value }); }} placeholder="Paste recording link..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="text-gray-500 block text-xs mb-1">Transcription</label>
                <textarea defaultValue={selectedMeeting.transcription || ""} onBlur={(e) => { if (e.target.value !== (selectedMeeting.transcription || "")) handleUpdateMeeting(selectedMeeting.id, { transcription: e.target.value }); }} rows={4} placeholder="Paste meeting transcription..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedMeeting(null)} className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Meeting-invite Draft modal — opens after Generate Link so the user
          can review and edit the email (and CC list) before sending. */}
      <Modal open={!!inviteDraft} onClose={() => setInviteDraft(null)} title="AI Draft Reply" size="lg">
        {inviteDraft && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700">✦ AI Generated</span>
              <span className="text-sm text-gray-500">To: <span className="font-medium text-gray-700">{inviteDraft.to || "—"}</span></span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                value={inviteDraft.subject}
                onChange={(e) => setInviteDraft({ ...inviteDraft, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CC <span className="text-xs text-gray-400 font-normal">(comma-separated, defaults to client contacts)</span></label>
              <input
                value={inviteDraft.cc}
                onChange={(e) => setInviteDraft({ ...inviteDraft, cc: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                rows={12}
                value={inviteDraft.body}
                onChange={(e) => setInviteDraft({ ...inviteDraft, body: e.target.value })}
                spellCheck="true"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">HTML is supported. The Join Meeting button is already embedded.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setInviteDraft(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
              <button
                disabled={inviteDraft.sending || !inviteDraft.to.trim()}
                onClick={async () => {
                  setInviteDraft({ ...inviteDraft, sending: true });
                  try {
                    const cc = inviteDraft.cc.split(",").map((s) => s.trim()).filter(Boolean);
                    await api.post(`/meetings/${inviteDraft.meetingId}/send-invite/`, {
                      subject: inviteDraft.subject,
                      to: inviteDraft.to,
                      cc,
                      body_html: inviteDraft.body,
                    });
                    toast.success("Meeting invite sent");
                    setInviteDraft(null);
                    fetchMeetings();
                  } catch (err) {
                    toast.error(getErrorMessage(err, "Failed to send invite"));
                    setInviteDraft((p) => p ? { ...p, sending: false } : p);
                  }
                }}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {inviteDraft.sending ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
