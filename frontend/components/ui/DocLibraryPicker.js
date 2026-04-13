"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const FILE_ICONS = { pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", zip: "📦", txt: "📃" };
const getIcon = (name) => FILE_ICONS[(name || "").split(".").pop()?.toLowerCase()] || "📎";
const fmtSize = (b) => !b ? "" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const BACKEND = "http://localhost:8000";

/**
 * In-app document library picker modal — browse CRM Documents folders/files
 * and attach any file to an email draft or add to a file list.
 *
 * Props:
 *   draftId    — if set, attaches to the draft via save-draft endpoint
 *   onPickFile — if set, called with the File blob + filename (for inline reply attachments)
 *   onClose    — close the modal
 *   onAttached — callback after successful attachment
 */
export default function DocLibraryPicker({ draftId, onPickFile, onClose, onAttached }) {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(null);

  const loadContents = async (folderId) => {
    setLoading(true);
    try {
      if (folderId) {
        const res = await api.get(`/documents/folders/${folderId}/contents/`);
        setFolders(res.data.folders || []);
        setFiles(res.data.files || []);
      } else {
        const [fRes, dRes] = await Promise.all([
          api.get("/documents/folders/", { params: { parent: "" } }),
          api.get("/documents/", { params: { folder: "" } }),
        ]);
        setFolders((fRes.data.results || fRes.data).filter(f => !f.parent));
        setFiles((dRes.data.results || dRes.data).filter(d => !d.folder));
      }
    } catch { toast.error("Failed to load documents"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadContents(null); }, []);

  const navigateToFolder = (folder) => {
    if (folder) {
      setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
      setCurrentFolder(folder.id);
      loadContents(folder.id);
    } else {
      setBreadcrumbs([]);
      setCurrentFolder(null);
      loadContents(null);
    }
  };

  const navigateToBreadcrumb = (idx) => {
    if (idx === -1) { navigateToFolder(null); return; }
    const crumb = breadcrumbs[idx];
    setBreadcrumbs(breadcrumbs.slice(0, idx + 1));
    setCurrentFolder(crumb.id);
    loadContents(crumb.id);
  };

  const attachFile = async (file) => {
    if (!file.file) return;
    setAttaching(file.id);
    try {
      const fileUrl = file.file.startsWith("http") ? file.file : BACKEND + file.file;
      const res = await fetch(fileUrl);
      const blob = await res.blob();
      const filename = file.filename || file.name || "document";

      if (onPickFile) {
        // For inline reply — return the File object to the caller
        const fileObj = new File([blob], filename, { type: blob.type });
        onPickFile(fileObj);
        toast.success(`${filename} added`);
        onAttached?.();
        onClose?.();
        return;
      }

      if (draftId) {
        // For AI Draft modal — attach to the draft on the server
        const fd = new FormData();
        fd.append("attachments", blob, filename);
        await api.post(`/communications/drafts/${draftId}/save-draft/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success(`${filename} attached`);
        onAttached?.();
      }
    } catch { toast.error("Failed to attach"); }
    finally { setAttaching(null); }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-semibold text-gray-800">Attach from Document Library</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-1 px-5 py-2 text-xs border-b border-gray-50 bg-gray-50/50">
          <button onClick={() => navigateToBreadcrumb(-1)} className={`px-2 py-0.5 rounded hover:bg-gray-100 ${!currentFolder ? "font-semibold text-indigo-600" : "text-gray-500"}`}>📁 Root</button>
          {breadcrumbs.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1">
              <span className="text-gray-300">/</span>
              <button onClick={() => navigateToBreadcrumb(i)} className={`px-2 py-0.5 rounded hover:bg-gray-100 ${i === breadcrumbs.length - 1 ? "font-semibold text-indigo-600" : "text-gray-500"}`}>{b.name}</button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
          ) : (
            <>
              {folders.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-gray-400 font-medium uppercase mb-2">Folders</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {folders.map(f => (
                      <button key={f.id} onClick={() => navigateToFolder(f)} className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-indigo-300 hover:bg-indigo-50/50 text-center transition-colors">
                        <span className="text-2xl">📁</span>
                        <p className="text-xs font-medium text-gray-800 mt-1 truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-400">{f.file_count} files</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {files.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase mb-2">Files</p>
                  <div className="space-y-1">
                    {files.map(f => (
                      <div key={f.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-indigo-50/50 border border-gray-100 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-lg shrink-0">{getIcon(f.filename || f.name)}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                            <p className="text-[10px] text-gray-400">{fmtSize(f.file_size)}{f.uploaded_by_name ? ` · by ${f.uploaded_by_name}` : ""}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => attachFile(f)}
                          disabled={attaching === f.id}
                          className="shrink-0 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 ml-2"
                        >
                          {attaching === f.id ? "..." : "Attach"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {folders.length === 0 && files.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">This folder is empty</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}
