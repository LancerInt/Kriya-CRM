"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchTasks, createTask, completeTask } from "@/store/slices/taskSlice";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/errorHandler";
import { format } from "date-fns";
import ModernSelect from "@/components/ui/ModernSelect";

export default function TasksPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.tasks);
  const { user } = useSelector((state) => state.auth);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "", owner: "" });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    dispatch(fetchTasks());
    api.get("/auth/users/").then(r => setUsers(r.data.results || r.data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.owner) delete payload.owner;
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

  const columns = [
    { key: "title", label: "Task", render: (row) => (
      <div>
        <span className="font-medium">{row.title}</span>
        {row.status_note && <p className="text-[10px] text-gray-400 mt-0.5">{row.status_note}</p>}
      </div>
    )},
    { key: "priority", label: "Priority", render: (row) => <StatusBadge status={row.priority} /> },
    { key: "status", label: "Status", render: (row) => (
      <div onClick={e => e.stopPropagation()}>
        <ModernSelect value={row.status} onChange={(v) => handleUpdateStatus(row.id, v)} size="xs" options={[
          { value: "pending", label: "Pending", color: "#d97706", dot: true },
          { value: "in_progress", label: "In Progress", color: "#2563eb", dot: true },
          { value: "completed", label: "Completed", color: "#059669", dot: true },
          { value: "cancelled", label: "Cancelled", color: "#dc2626", dot: true },
        ]} />
      </div>
    )},
    { key: "due_date", label: "Due Date", render: (row) => row.due_date ? format(new Date(row.due_date), "MMM d, yyyy") : "\u2014" },
    { key: "owner_name", label: "Assigned To", render: (row) => row.owner_name || "\u2014" },
    { key: "creator_name", label: "Assigned By", render: (row) => <span className="text-gray-500">{row.creator_name || "\u2014"}</span> },
    { key: "actions", label: "", render: (row) => row.status !== "completed" && row.status !== "cancelled" && (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input placeholder="Add note..." onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { handleUpdateStatus(row.id, row.status, e.target.value.trim()); e.target.value = ""; } }}
          className="text-xs px-2 py-1 border border-gray-200 rounded-lg outline-none w-28 focus:ring-1 focus:ring-indigo-400" />
        <button onClick={() => handleComplete(row.id)} className="text-xs text-green-600 hover:text-green-700 font-medium whitespace-nowrap">
          Complete
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Tasks"
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Task
          </button>
        }
      />
      <DataTable columns={columns} data={list} loading={loading} emptyTitle="No tasks" emptyDescription="Create your first task" />

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
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
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
