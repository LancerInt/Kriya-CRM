"use client";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format, isToday, isFuture, isPast, differenceInMinutes, isThisWeek } from "date-fns";
import api from "@/lib/axios";
import { getErrorMessage } from "@/lib/errorHandler";

function fmtDateTime(d) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy h:mm a"); } catch { return "—"; }
}

// Status -> tone tokens for the row stripe + chip.
const STATUS_TONE = {
  scheduled: { bar: "bg-indigo-500",  chip: "bg-indigo-50 border-indigo-100" },
  completed: { bar: "bg-emerald-500", chip: "bg-emerald-50 border-emerald-100" },
  missed:    { bar: "bg-rose-500",    chip: "bg-rose-50 border-rose-100" },
  cancelled: { bar: "bg-gray-400",    chip: "bg-gray-50 border-gray-200" },
};
const PLATFORM_META = {
  google_meet: { label: "Google Meet", icon: "📹", color: "bg-emerald-100 text-emerald-700" },
  zoom:        { label: "Zoom",        icon: "🎥", color: "bg-blue-100 text-blue-700" },
  teams:       { label: "Teams",       icon: "💼", color: "bg-violet-100 text-violet-700" },
  whatsapp:    { label: "WhatsApp",    icon: "💬", color: "bg-green-100 text-green-700" },
  phone:       { label: "Phone",       icon: "📞", color: "bg-amber-100 text-amber-700" },
  in_person:   { label: "In Person",   icon: "🤝", color: "bg-rose-100 text-rose-700" },
  other:       { label: "Other",       icon: "📅", color: "bg-gray-100 text-gray-700" },
};

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

  // Filters
  const [filters, setFilters] = useState({ search: "", status: "", platform: "" });
  const filterInput = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none";

  const stats = useMemo(() => {
    const buckets = { total: meetings.length, upcoming: 0, today: 0, week: 0, completed: 0 };
    meetings.forEach((m) => {
      const dt = m.scheduled_at ? new Date(m.scheduled_at) : null;
      if (!dt) return;
      if (m.status === "scheduled" && isFuture(dt)) buckets.upcoming += 1;
      if (isToday(dt)) buckets.today += 1;
      if (isThisWeek(dt) && m.status === "scheduled") buckets.week += 1;
      if (m.status === "completed") buckets.completed += 1;
    });
    return buckets;
  }, [meetings]);

  const filtered = useMemo(() => {
    return meetings.filter((m) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${m.client_name || ""} ${m.agenda || ""} ${m.user_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.status && m.status !== filters.status) return false;
      if (filters.platform && m.platform !== filters.platform) return false;
      return true;
    }).sort((a, b) => {
      // Upcoming first, then most recent
      const aUp = isUpcoming(a), bUp = isUpcoming(b);
      if (aUp && !bUp) return -1;
      if (!aUp && bUp) return 1;
      // Within upcoming, soonest first
      if (aUp && bUp) return new Date(a.scheduled_at) - new Date(b.scheduled_at);
      // Within past, most recent first
      return new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0);
    });
  }, [meetings, filters]);

  const filtersActive = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ search: "", status: "", platform: "" });

  const timeUntilLabel = (dt) => {
    if (!dt) return "";
    const diffMin = differenceInMinutes(new Date(dt), new Date());
    if (diffMin < 0) return null;
    if (diffMin < 60) return `in ${diffMin}m`;
    if (diffMin < 1440) return `in ${Math.floor(diffMin / 60)}h`;
    if (diffMin < 10080) return `in ${Math.floor(diffMin / 1440)}d`;
    return null;
  };

  return (
    <div>
      <PageHeader
        title="Meetings & Calls"
        subtitle={filtersActive ? `${filtered.length} of ${meetings.length} meetings` : `${meetings.length} meetings`}
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
            + Schedule Meeting
          </button>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📅</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Upcoming</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.upcoming}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">scheduled ahead</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">🔥</span><span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Today</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.today}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">on the calendar</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📆</span><span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">This Week</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.week}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">7-day window</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">✅</span><span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Completed</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.completed}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">closed out</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pr-1">Filters</span>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Client, agenda, host..." className={`${filterInput} w-full pl-8`} />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={filterInput}>
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filters.platform} onChange={(e) => setFilters({ ...filters, platform: e.target.value })} className={filterInput}>
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50">
            Clear
          </button>
        )}
      </div>

      {/* Meeting cards */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-base font-semibold text-gray-800">{filtersActive ? "No meetings match" : "No meetings yet"}</p>
          <p className="text-sm text-gray-500 mt-1">{filtersActive ? "Try clearing one of the filters above." : "Schedule your first meeting to get started."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const tone = STATUS_TONE[row.status] || STATUS_TONE.scheduled;
            const platform = PLATFORM_META[row.platform] || PLATFORM_META.other;
            const dt = row.scheduled_at ? new Date(row.scheduled_at) : null;
            const upcoming = isUpcoming(row);
            const today = dt && isToday(dt);
            const timeBadge = upcoming ? timeUntilLabel(dt) : null;
            const endTime = dt ? new Date(dt.getTime() + (row.duration_minutes || 60) * 60000) : null;
            const ended = endTime && new Date() > endTime;
            return (
              <div
                key={row.id}
                onClick={() => setSelectedMeeting(row)}
                className={`group relative bg-white border ${tone.chip} rounded-xl px-4 py-3 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all`}
              >
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.bar}`} />

                <div className="flex items-center gap-4 pl-2 flex-wrap md:flex-nowrap">
                  {/* Platform icon */}
                  <div className={`w-11 h-11 rounded-xl ${platform.color} flex items-center justify-center text-lg shrink-0`}>
                    {platform.icon}
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1 basis-full md:basis-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 tracking-tight">{row.client_name || "—"}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-700 bg-gray-100 rounded px-1.5 py-0.5">{platform.label}</span>
                      {today && upcoming && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-white">Today</span>
                      )}
                      {timeBadge && !today && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500 text-white">{timeBadge}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{row.agenda || <span className="text-gray-400 italic">No agenda</span>}</p>
                  </div>

                  {/* Date/time */}
                  <div className="hidden md:block text-right shrink-0 min-w-[140px]">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">When</p>
                    <p className={`text-xs font-semibold ${upcoming ? "text-indigo-700" : "text-gray-700"}`}>
                      {dt ? format(dt, "MMM d, h:mm a") : "—"}
                    </p>
                    {row.duration_minutes && (
                      <p className="text-[10px] text-gray-400">{row.duration_minutes} min</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="hidden sm:block w-28 text-center shrink-0">
                    <StatusBadge status={row.status} />
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Join / Generate / Ended */}
                    {(row.status === "completed" || row.status === "cancelled" || row.status === "missed") ? (
                      <span className="text-[11px] text-gray-400 italic px-2">
                        {row.status === "completed" ? "Ended" : row.status === "cancelled" ? "Cancelled" : "Missed"}
                      </span>
                    ) : row.meeting_link && !ended ? (
                      <a
                        href={row.meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                      >
                        ↗ Join
                      </a>
                    ) : ended ? (
                      <span className="text-[11px] text-gray-400 italic px-2">Ended</span>
                    ) : (row.platform === "zoom" || row.platform === "google_meet") ? (
                      <button
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-100 rounded-md hover:bg-violet-100"
                      >
                        ✨ Generate Link
                      </button>
                    ) : null}

                    {/* Status quick-change */}
                    {row.status === "scheduled" && (
                      <select
                        value={row.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          e.stopPropagation();
                          try {
                            await api.patch(`/meetings/${row.id}/`, { status: e.target.value });
                            toast.success(`Marked ${e.target.value}`);
                            fetchMeetings();
                          } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
                        }}
                        className="text-[11px] font-medium border border-gray-200 rounded-md px-1.5 py-1 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="missed">Missed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedMeeting(row); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md hover:bg-indigo-100"
                    >
                      Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            <button type="submit" className="px-5 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all">Schedule</button>
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
