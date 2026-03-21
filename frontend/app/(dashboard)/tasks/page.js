"use client";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchTasks, createTask, completeTask } from "@/store/slices/taskSlice";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { format } from "date-fns";

export default function TasksPage() {
  const dispatch = useDispatch();
  const { list, loading } = useSelector((state) => state.tasks);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "" });

  useEffect(() => {
    dispatch(fetchTasks());
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await dispatch(createTask(form)).unwrap();
      toast.success("Task created");
      setShowModal(false);
      setForm({ title: "", description: "", priority: "medium", due_date: "" });
    } catch {
      toast.error("Failed to create task");
    }
  };

  const handleComplete = async (id) => {
    try {
      await dispatch(completeTask(id)).unwrap();
      toast.success("Task completed");
    } catch {
      toast.error("Failed to complete task");
    }
  };

  const columns = [
    { key: "title", label: "Task", render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "priority", label: "Priority", render: (row) => <StatusBadge status={row.priority} /> },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "due_date", label: "Due Date", render: (row) => row.due_date ? format(new Date(row.due_date), "MMM d, yyyy") : "\u2014" },
    { key: "owner_name", label: "Owner", render: (row) => row.owner_name || "\u2014" },
    { key: "actions", label: "", render: (row) => row.status !== "completed" && (
      <button onClick={(e) => { e.stopPropagation(); handleComplete(row.id); }} className="text-xs text-green-600 hover:text-green-700 font-medium">
        Complete
      </button>
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
          <div className="flex gap-3 pt-2">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Create Task</button>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
