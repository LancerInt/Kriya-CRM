"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { fetchTasks, createTask, completeTask } from "@/store/slices/taskSlice";
import PageHeader from "@/components/ui/PageHeader";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format, isPast } from "date-fns";
import ModernSelect from "@/components/ui/ModernSelect";
import { confirmDialog } from "@/lib/confirm";
import AISummaryButton from "@/components/ai/AISummaryButton";

// Priority -> tone tokens used for the row's left stripe + chip.
const PRIORITY_TONE = {
  urgent: { bar: "bg-rose-500",   chip: "bg-rose-50 border-rose-100",   label: "text-rose-700",   pill: "bg-rose-100 text-rose-700"   },
  high:   { bar: "bg-orange-400", chip: "bg-orange-50 border-orange-100",label: "text-orange-700", pill: "bg-orange-100 text-orange-700" },
  medium: { bar: "bg-amber-400",  chip: "bg-amber-50/60 border-amber-100",label: "text-amber-700", pill: "bg-amber-100 text-amber-700" },
  low:    { bar: "bg-slate-300",  chip: "bg-white border-gray-200",      label: "text-slate-600",  pill: "bg-slate-100 text-slate-600"  },
};
const priorityTone = (p) => PRIORITY_TONE[p] || PRIORITY_TONE.medium;

export default function TasksPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.tasks);
  const { user } = useSelector((state) => state.auth);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "", owner: "" });
  const [users, setUsers] = useState([]);
  const [viewTask, setViewTask] = useState(null);

  const handleDelete = async (taskId) => {
    if (!(await confirmDialog("Delete this task? It will be moved to the recycle bin."))) return;
    try {
      await api.delete(`/tasks/${taskId}/`);
      toast.success("Task deleted");
      dispatch(fetchTasks());
      setViewTask(null);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete task")); }
  };

  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  useEffect(() => {
    dispatch(fetchTasks());
    api.get("/auth/users/").then(r => setUsers(r.data.results || r.data)).catch(() => {});
  }, []);

  // If the dashboard (or any link) sent us here with ?focus=<task_id>,
  // auto-open that task in the existing detail modal once the list loads.
  useEffect(() => {
    if (!focusId || !list?.length) return;
    const t = list.find((row) => String(row.id) === String(focusId));
    if (t) setViewTask(t);
  }, [focusId, list]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.owner) delete payload.owner;
      // datetime-local sends "2026-04-08T17:53" — Django's DateTimeField is
      // strict about timezone, so convert to a full ISO string in the user's
      // local timezone. Empty value → omit so the field stays nullable.
      if (payload.due_date) {
        try {
          payload.due_date = new Date(payload.due_date).toISOString();
        } catch {
          delete payload.due_date;
        }
      } else {
        delete payload.due_date;
      }
      await dispatch(createTask(payload)).unwrap();
      toast.success("Task created");
      setShowModal(false);
      setForm({ title: "", description: "", priority: "medium", due_date: "", owner: "" });
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create task")); }
  };

  const handleComplete = async (id) => {
    try {
      await dispatch(completeTask(id)).unwrap();
      toast.success("Task completed");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to complete task")); }
  };

  const handleUpdateStatus = async (taskId, status, note) => {
    try {
      await api.post(`/tasks/${taskId}/update-status/`, { status, status_note: note || "" });
      toast.success("Status updated");
      dispatch(fetchTasks());
    } catch (err) { toast.error(getErrorMessage(err, "Failed to update")); }
  };

  // Filters
  const [filters, setFilters] = useState({ search: "", status: "", priority: "" });
  const filterInput = "px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none";

  const stats = useMemo(() => {
    const buckets = { total: list?.length || 0, pending: 0, in_progress: 0, completed: 0, overdue: 0 };
    (list || []).forEach((t) => {
      if (t.status === "pending") buckets.pending += 1;
      if (t.status === "in_progress") buckets.in_progress += 1;
      if (t.status === "completed") buckets.completed += 1;
      if (["pending", "in_progress"].includes(t.status) && t.due_date && isPast(new Date(t.due_date))) {
        buckets.overdue += 1;
      }
    });
    return buckets;
  }, [list]);

  const filtered = useMemo(() => (list || []).filter((t) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${t.title || ""} ${t.owner_name || ""} ${t.creator_name || ""} ${t.client_name || ""} ${t.status_note || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.status === "overdue") {
      if (!(["pending", "in_progress"].includes(t.status) && t.due_date && isPast(new Date(t.due_date)))) return false;
    } else if (filters.status && t.status !== filters.status) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    return true;
  }), [list, filters]);

  const filtersActive = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ search: "", status: "", priority: "" });

  const STATUS_OPTIONS = [
    { value: "pending", label: "Pending", color: "#d97706", dot: true },
    { value: "in_progress", label: "In Progress", color: "#2563eb", dot: true },
    { value: "completed", label: "Completed", color: "#059669", dot: true },
    { value: "cancelled", label: "Cancelled", color: "#dc2626", dot: true },
  ];

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={filtersActive ? `${filtered.length} of ${list?.length || 0} tasks` : `${list?.length || 0} tasks`}
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
              + New Task
            </button>
            <AISummaryButton variant="gradient" title="Tasks Summary" prompt={`Write a tight Tasks summary using the pre-loaded task data. Structure with these sections (## headings):\n\n## Overview\nOne line: total counts by status (pending, in progress, completed).\n\n## Overdue\nUp to 5 bullets — overdue tasks only: title · owner · client · days overdue.\n\n## Workload\nTop 3 owners by open task count.\n\n## Needs Attention\nUp to 5 specific high-priority or stuck tasks needing action.\n\n### Next Steps\n2-3 concrete actions.\n\nKeep under 300 words. Don't enumerate every task.`} />
          </div>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">📋</span><span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Total</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.total}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">all tasks</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⏳</span><span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Open</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.pending + stats.in_progress}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">{stats.pending} pending · {stats.in_progress} in progress</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-xl p-4">
          <div className="flex items-center gap-2"><span className="text-lg">⚠️</span><span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Overdue</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900 leading-none">{stats.overdue}</p>
          <p className="text-[11px] text-gray-500 mt-1.5">past due date</p>
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
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Title, owner, client, note..." className={`${filterInput} w-full pl-8`} />
        </div>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={filterInput}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="overdue">Overdue only</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} className={filterInput}>
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50">
            Clear
          </button>
        )}
      </div>

      {/* Task cards */}
      {loading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-base font-semibold text-gray-800">{filtersActive ? "No tasks match" : "No tasks yet"}</p>
          <p className="text-sm text-gray-500 mt-1">{filtersActive ? "Try clearing one of the filters above." : "Create your first task to get going."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const tone = priorityTone(row.priority);
            const overdue = ["pending", "in_progress"].includes(row.status) && row.due_date && isPast(new Date(row.due_date));
            const ownerInitial = (row.owner_name || "?").trim()[0]?.toUpperCase() || "?";
            const isClosed = row.status === "completed" || row.status === "cancelled";
            return (
              <div
                key={row.id}
                onClick={() => setViewTask(row)}
                className={`group relative bg-white border ${tone.chip} rounded-xl px-4 py-3 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all ${isClosed ? "opacity-80" : ""}`}
              >
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${tone.bar}`} />

                <div className="flex items-center gap-4 pl-2 flex-wrap md:flex-nowrap">
                  <div className="min-w-0 flex-1 basis-full md:basis-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold tracking-tight ${isClosed ? "text-gray-500 line-through decoration-1" : "text-gray-900"}`}>{row.title}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone.pill}`}>{row.priority || "medium"}</span>
                      {overdue && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white">Overdue</span>
                      )}
                    </div>
                    {row.status_note && (
                      <div className="mt-1.5 max-w-full">
                        <p
                          className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md whitespace-pre-wrap leading-relaxed"
                          style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                        >
                          💬 {row.status_note}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="hidden sm:flex items-center gap-2 shrink-0 min-w-[150px]">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm">
                      {ownerInitial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Owner</p>
                      <p className="text-xs font-semibold text-gray-800 truncate">{row.owner_name || "—"}</p>
                    </div>
                  </div>

                  <div className="hidden md:block text-right shrink-0 min-w-[120px]">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Due</p>
                    <p className={`text-xs font-semibold ${overdue ? "text-rose-700" : "text-gray-700"}`}>
                      {row.due_date ? format(new Date(row.due_date), "MMM d, h:mm a") : "—"}
                    </p>
                  </div>

                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <ModernSelect value={row.status} onChange={(v) => handleUpdateStatus(row.id, v)} size="xs" options={STATUS_OPTIONS} />
                  </div>

                  {!isClosed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleComplete(row.id); }}
                      title="Mark complete"
                      className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Detail Modal */}
      <Modal open={!!viewTask} onClose={() => setViewTask(null)} title="Task Details" size="md">
        {viewTask && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{viewTask.title}</h3>
              {viewTask.description && <p className="text-sm text-gray-600 mt-1">{viewTask.description}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Status</span>
                <StatusBadge status={viewTask.status} />
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Priority</span>
                <StatusBadge status={viewTask.priority} />
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Assigned To</span>
                <span className="font-medium text-gray-800">{viewTask.owner_name || "—"}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Assigned By</span>
                <span className="font-medium text-gray-800">{viewTask.creator_name || "—"}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Due Date</span>
                <span className="font-medium text-gray-800">{viewTask.due_date ? format(new Date(viewTask.due_date), "MMM d, yyyy h:mm a") : "—"}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">Created</span>
                <span className="font-medium text-gray-800">{viewTask.created_at ? format(new Date(viewTask.created_at), "MMM d, yyyy h:mm a") : "—"}</span>
              </div>
              {viewTask.completed_at && (
                <div className="bg-green-50 rounded-lg p-3 col-span-2">
                  <span className="text-xs text-green-600 block mb-1">Completed At</span>
                  <span className="font-medium text-green-800">{format(new Date(viewTask.completed_at), "MMM d, yyyy h:mm a")}</span>
                </div>
              )}
            </div>
            {viewTask.status_note && (
              <div className="bg-indigo-50 rounded-lg p-3">
                <span className="text-xs text-indigo-600 block mb-1">Note</span>
                <p className="text-sm text-indigo-800 whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>{viewTask.status_note}</p>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <button
                onClick={() => handleDelete(viewTask.id)}
                className="px-4 py-2 text-red-600 bg-red-50 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-100"
              >
                Delete
              </button>
              <div className="flex gap-2">
                {viewTask.status !== "completed" && viewTask.status !== "cancelled" && (
                  <button
                    onClick={() => { handleComplete(viewTask.id); setViewTask(null); }}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                  >
                    Mark Complete
                  </button>
                )}
                <button onClick={() => setViewTask(null)} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Task">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
            {(() => {
              let assignees = [];
              if (user?.role === "admin" || user?.role === "manager") {
                assignees = users.map(u => ({ ...u, tag: u.role }));
              } else {
                // Executive: show all executives
                assignees = users.filter(u => u.role === "executive").map(u => ({
                  ...u, tag: u.id === user?.id ? "Self" : "Executive"
                }));
              }
              return (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {assignees.map(u => (
                    <label key={u.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${form.owner === u.id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}>
                      <input type="radio" name="task_owner_global" value={u.id} checked={form.owner === u.id} onChange={() => setForm({ ...form, owner: u.id })} className="text-indigo-600" />
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {(u.full_name || u.first_name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{u.full_name || `${u.first_name} ${u.last_name}`}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        u.tag === "Self" ? "bg-blue-50 text-blue-600" :
                        u.tag === "admin" ? "bg-red-50 text-red-600" :
                        u.tag === "manager" ? "bg-purple-50 text-purple-600" :
                        "bg-green-50 text-green-600"
                      }`}>{u.tag === "Self" ? "You" : u.tag?.charAt(0).toUpperCase() + u.tag?.slice(1)}</span>
                    </label>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date &amp; Time</label>
              <input
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
              📎 Add Files
              <input type="file" multiple onChange={(e) => setForm({ ...form, attachments: [...(form.attachments || []), ...Array.from(e.target.files)] })} className="hidden" />
            </label>
            {form.attachments?.length > 0 && (
              <div className="mt-2 space-y-1">
                {form.attachments.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                    <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                    <button type="button" onClick={() => setForm({ ...form, attachments: form.attachments.filter((_, idx) => idx !== i) })} className="text-red-400 hover:text-red-600">&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Task</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
