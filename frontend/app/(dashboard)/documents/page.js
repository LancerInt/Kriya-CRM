"use client";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import Modal from "@/components/ui/Modal";
import { confirmDialog } from "@/lib/confirm";

const FILE_ICONS = { pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", csv: "📊", ppt: "📑", pptx: "📑", jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", zip: "📦", rar: "📦", txt: "📃" };
const getIcon = (name) => FILE_ICONS[(name || "").split(".").pop()?.toLowerCase()] || "📎";
const fmtSize = (b) => !b ? "" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;
const getExt = (name) => (name || "").split(".").pop()?.toLowerCase();
const isImage = (name) => ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(getExt(name));
const isPdf = (name) => getExt(name) === "pdf";
const isText = (name) => ["txt", "csv", "json", "xml", "md"].includes(getExt(name));
const BACKEND = "http://localhost:8000";

export default function DocumentsPage() {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null); // null = root
  const [breadcrumbs, setBreadcrumbs] = useState([]); // [{id, name}]
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState("");
  const [search, setSearch] = useState("");
  const [allFiles, setAllFiles] = useState([]); // all files across all folders for search
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [preview, setPreview] = useState(null); // file object for preview
  const [previewUrl, setPreviewUrl] = useState(null); // blob URL for preview
  const [previewLoading, setPreviewLoading] = useState(false);
  // Visibility 3-dot menu — null when closed, otherwise "folder-{id}" / "file-{id}"
  const [openMenu, setOpenMenu] = useState(null);
  const currentUser = useSelector((s) => s.auth.user);
  const isAdminOrManager = currentUser?.role === "admin" || currentUser?.role === "manager";

  const openPreview = async (file) => {
    setPreview(file);
    setPreviewUrl(null);
    if (!file.file) return;
    setPreviewLoading(true);
    try {
      const fileUrl = file.file.startsWith("http") ? file.file : BACKEND + file.file;
      const res = await fetch(fileUrl);
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch { setPreviewUrl(null); }
    finally { setPreviewLoading(false); }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreview(null); setPreviewUrl(null);
  };
  const dragCounter = useRef(0);

  const loadContents = async (folderId) => {
    setLoading(true);
    try {
      if (folderId) {
        const res = await api.get(`/documents/folders/${folderId}/contents/`);
        setFolders(res.data.folders || []);
        setFiles(res.data.files || []);
      } else {
        // Root: get root folders + root files
        const [fRes, dRes] = await Promise.all([
          api.get("/documents/folders/", { params: { parent: "" } }),
          api.get("/documents/", { params: { folder: "" } }),
        ]);
        setFolders((fRes.data.results || fRes.data).filter(f => !f.parent));
        setFiles((dRes.data.results || dRes.data).filter(d => !d.folder));
      }
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };

  const loadAllFiles = () => {
    api.get("/documents/").then(r => setAllFiles(r.data.results || r.data)).catch(() => {});
  };

  useEffect(() => { loadContents(null); loadAllFiles(); }, []);

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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.post("/documents/folders/", { name: newFolderName.trim(), parent: currentFolder || null });
      setNewFolderName(""); setShowNewFolder(false);
      loadContents(currentFolder);
      toast.success("Folder created");
    } catch { toast.error("Failed to create folder"); }
  };

  const handleDeleteFolder = async (id) => {
    if (!(await confirmDialog("Delete this folder and all its contents?"))) return;
    try { await api.delete(`/documents/folders/${id}/`); loadContents(currentFolder); toast.success("Folder deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  const handleUpload = async (file, name) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name || file.name.replace(/\.[^.]+$/, ""));
    fd.append("filename", file.name);
    fd.append("file_size", file.size);
    fd.append("mime_type", file.type);
    if (currentFolder) fd.append("folder", currentFolder);
    try {
      await api.post("/documents/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${file.name} uploaded`);
      loadContents(currentFolder); loadAllFiles();
    } catch { toast.error(`Failed to upload ${file.name}`); }
  };

  const handleDeleteFile = async (id) => {
    if (!(await confirmDialog("Delete this file?"))) return;
    try { await api.delete(`/documents/${id}/`); loadContents(currentFolder); loadAllFiles(); toast.success("Deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  const handleRename = async (id, type) => {
    try {
      if (type === "folder") await api.patch(`/documents/folders/${id}/`, { name: renameVal });
      else await api.patch(`/documents/${id}/`, { name: renameVal });
      setRenaming(null); loadContents(currentFolder); toast.success("Renamed");
    } catch { toast.error("Failed to rename"); }
  };

  // Toggle public/private on a folder or file via the dedicated backend
  // set-visibility action. When switching from private → public, show a
  // confirmation popup so the user doesn't accidentally expose a file.
  const handleSetVisibility = async (id, type, value) => {
    // Find current item to check if it's a private → public switch
    const current = type === "folder"
      ? folders.find(f => f.id === id)
      : files.find(f => f.id === id);
    if (current?.visibility === "private" && value === "public") {
      if (!(await confirmDialog("This will make it visible to everyone in the organization. Are you sure you want to make it public?"))) {
        setOpenMenu(null);
        return;
      }
    }
    try {
      const url = type === "folder"
        ? `/documents/folders/${id}/set-visibility/`
        : `/documents/${id}/set-visibility/`;
      await api.post(url, { visibility: value });
      // Optimistic local update
      if (type === "folder") {
        setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, visibility: value } : f)));
      } else {
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, visibility: value } : f)));
        setAllFiles((prev) => prev.map((f) => (f.id === id ? { ...f, visibility: value } : f)));
      }
      setOpenMenu(null);
      toast.success(`Marked as ${value}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update visibility"));
    }
  };

  // Close the visibility menu when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e) => {
      if (!e.target.closest("[data-visibility-menu]")) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Drag & drop + paste
  const onDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false); };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = async (e) => {
    e.preventDefault(); setDragging(false); dragCounter.current = 0;
    for (const file of Array.from(e.dataTransfer.files)) await handleUpload(file);
  };

  useEffect(() => {
    const handler = (e) => {
      const files = Array.from(e.clipboardData?.items || []).filter(i => i.kind === "file").map(i => i.getAsFile()).filter(Boolean);
      if (files.length > 0) { e.preventDefault(); files.forEach(f => handleUpload(f)); }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [currentFolder]);

  // When searching, search ALL files globally; otherwise show current folder contents
  const isSearching = search.trim().length > 0;
  const q = search.toLowerCase();
  const filteredFolders = isSearching ? [] : folders;
  const filteredFiles = isSearching
    ? allFiles.filter(f => (f.name || "").toLowerCase().includes(q) || (f.filename || "").toLowerCase().includes(q) || (f.folder_name || "").toLowerCase().includes(q))
    : files;

  return (
    <div onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop} className="relative min-h-[60vh]">
      {dragging && (
        <div className="absolute inset-0 z-50 bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded-xl flex flex-col items-center justify-center pointer-events-none">
          <svg className="w-16 h-16 text-indigo-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
          <p className="text-indigo-600 font-semibold text-lg">Drop files to upload</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="font-semibold text-gray-700">{folders.length}</span> folder{folders.length !== 1 ? "s" : ""}
            <span className="mx-1.5 text-gray-300">·</span>
            <span className="font-semibold text-gray-700">{files.length}</span> file{files.length !== 1 ? "s" : ""}
            {currentFolder && breadcrumbs.length > 0 && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                in <span className="font-medium text-gray-700">{breadcrumbs[breadcrumbs.length - 1]?.name}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewFolder(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-xl hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Folder
          </button>
          <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4m4-4v13" />
            </svg>
            Upload
          </button>
        </div>
      </div>

      {/* Breadcrumbs — chevron-separated chip style */}
      <nav className="flex flex-wrap items-center gap-1 mb-4 text-sm bg-white border border-gray-200 rounded-xl px-3 py-2">
        <button
          onClick={() => navigateToBreadcrumb(-1)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!currentFolder ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Root
        </button>
        {breadcrumbs.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${i === breadcrumbs.length - 1 ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {b.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search all files across all folders..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 bg-white"
        />
      </div>
      {isSearching && (
        <p className="text-xs text-gray-500 mb-3">
          Showing <span className="font-semibold text-gray-700">{filteredFiles.length}</span> result{filteredFiles.length !== 1 ? "s" : ""} for <span className="font-semibold text-indigo-600">"{search}"</span>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : (
        <div>
          {/* Folders */}
          {filteredFolders.length > 0 && (
            <div className="mb-6">
              <p className="text-[11px] text-gray-500 font-bold mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                Folders ({filteredFolders.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredFolders.map(f => {
                  const canManage = isAdminOrManager || f.created_by === currentUser?.id;
                  const isPublic = f.visibility === "public";
                  return (
                  <div
                    key={f.id}
                    onDoubleClick={() => navigateToFolder(f)}
                    onClick={() => navigateToFolder(f)}
                    className="group relative bg-white border border-gray-200 rounded-2xl p-4 cursor-pointer hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
                    title="Click to open"
                  >
                    {/* Visibility chip */}
                    <span
                      className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full border ${
                        isPublic
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                      title={isPublic ? "Visible to everyone" : "Visible to you + admin/manager"}
                    >
                      {isPublic ? (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      )}
                      {isPublic ? "PUBLIC" : "PRIVATE"}
                    </span>
                    <div className="text-center pt-3">
                      <div className="text-5xl mb-1.5 transition-transform group-hover:scale-110">📁</div>
                      {renaming === `folder-${f.id}` ? (
                        <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={() => handleRename(f.id, "folder")} onKeyDown={e => { if (e.key === "Enter") handleRename(f.id, "folder"); if (e.key === "Escape") setRenaming(null); }} autoFocus onClick={(e) => e.stopPropagation()} className="w-full text-center text-sm mt-1 border border-indigo-300 rounded-md px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      ) : (
                        <p className="text-sm font-bold text-gray-900 truncate" title={f.name}>{f.name}</p>
                      )}
                      <div className="flex items-center justify-center gap-1 mt-1.5">
                        <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-1.5 py-0.5">
                          {f.file_count} {f.file_count === 1 ? "file" : "files"}
                        </span>
                        {f.subfolder_count > 0 && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-1.5 py-0.5">
                            {f.subfolder_count} {f.subfolder_count === 1 ? "subfolder" : "subfolders"}
                          </span>
                        )}
                      </div>
                      {f.created_by_name && <p className="text-[10px] text-gray-400 mt-1.5">by {f.created_by_name}</p>}
                    </div>
                    <div className="absolute top-2.5 right-2.5 hidden group-hover:flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setRenaming(`folder-${f.id}`); setRenameVal(f.name); }} className="w-6 h-6 bg-white border border-gray-200 rounded-md hover:bg-indigo-50 hover:border-indigo-200 flex items-center justify-center text-gray-500 hover:text-indigo-600 shadow-sm" title="Rename">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }} className="w-6 h-6 bg-white border border-gray-200 rounded-md hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center text-gray-500 hover:text-rose-600 shadow-sm" title="Delete">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                      </button>
                      {canManage && (
                        <div className="relative" data-visibility-menu>
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === `folder-${f.id}` ? null : `folder-${f.id}`); }}
                            className="w-6 h-6 bg-gray-100 rounded text-[10px] hover:bg-gray-200 flex items-center justify-center font-bold"
                            title="More options"
                          >
                            ⋮
                          </button>
                          {openMenu === `folder-${f.id}` && (
                            <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40 text-left" onClick={(e) => e.stopPropagation()}>
                              <p className="px-3 py-1 text-[10px] text-gray-400 uppercase font-semibold">Visibility</p>
                              <button
                                onClick={() => handleSetVisibility(f.id, "folder", "private")}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${!isPublic ? "font-semibold text-indigo-600" : "text-gray-700"}`}
                              >
                                <span>🔒</span>
                                <span>Private</span>
                                {!isPublic && <span className="ml-auto">✓</span>}
                              </button>
                              <button
                                onClick={() => handleSetVisibility(f.id, "folder", "public")}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${isPublic ? "font-semibold text-indigo-600" : "text-gray-700"}`}
                              >
                                <span>🌐</span>
                                <span>Public</span>
                                {isPublic && <span className="ml-auto">✓</span>}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Files */}
          {filteredFiles.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-500 font-bold mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Files ({filteredFiles.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredFiles.map(f => {
                  const canManage = isAdminOrManager || f.uploaded_by === currentUser?.id;
                  const isPublic = f.visibility === "public";
                  const fname = f.filename || f.name || "";
                  const ext = (fname.split(".").pop() || "").toLowerCase();
                  const fileImg = isImage(fname) && f.file;
                  return (
                  <div
                    key={f.id}
                    onClick={() => openPreview(f)}
                    className="group relative bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col"
                  >
                    {/* Visibility chip */}
                    <span
                      className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center justify-center w-5 h-5 rounded-full border ${
                        isPublic
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                      title={isPublic ? "Visible to everyone" : "Visible to you + admin/manager"}
                    >
                      {isPublic ? (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      )}
                    </span>

                    {/* Preview area */}
                    <div className={`aspect-[4/3] flex items-center justify-center border-b border-gray-100 ${fileImg ? "bg-gray-50" : "bg-gradient-to-br from-gray-50 to-slate-100"}`}>
                      {fileImg ? (
                        <img src={f.file.startsWith("http") ? f.file : BACKEND + f.file} alt={f.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-gray-500">
                          <span className="text-4xl">{getIcon(fname)}</span>
                          <span className="text-[9px] uppercase tracking-widest font-bold">{ext || "FILE"}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-2.5 flex flex-col gap-0.5">
                      {renaming === `file-${f.id}` ? (
                        <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={() => handleRename(f.id, "file")} onKeyDown={e => { if (e.key === "Enter") handleRename(f.id, "file"); if (e.key === "Escape") setRenaming(null); }} autoFocus onClick={(e) => e.stopPropagation()} className="w-full text-center text-sm border border-indigo-300 rounded-md px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      ) : (
                        <p className="text-xs font-bold text-gray-900 truncate" title={f.name}>{f.name}</p>
                      )}
                      <p className="text-[10px] text-gray-500 truncate">
                        <span className="font-semibold text-gray-600">{fmtSize(f.file_size) || "—"}</span>
                        {f.created_at && <><span className="mx-1 text-gray-300">·</span>{format(new Date(f.created_at), "MMM d, yyyy")}</>}
                      </p>
                      {isSearching && f.folder_name && (
                        <p className="text-[10px] text-indigo-600 truncate flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                          {f.folder_name}
                        </p>
                      )}
                      {f.uploaded_by_name && <p className="text-[10px] text-gray-400 truncate">by {f.uploaded_by_name}</p>}
                    </div>

                    {/* Hover actions */}
                    <div className="absolute top-2.5 right-2.5 hidden group-hover:flex gap-1">
                      {f.file && (
                        <a href={f.file} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="w-6 h-6 bg-white border border-gray-200 rounded-md hover:bg-indigo-50 hover:border-indigo-200 flex items-center justify-center text-gray-500 hover:text-indigo-600 shadow-sm" title="Download">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                        </a>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setRenaming(`file-${f.id}`); setRenameVal(f.name); }} className="w-6 h-6 bg-white border border-gray-200 rounded-md hover:bg-indigo-50 hover:border-indigo-200 flex items-center justify-center text-gray-500 hover:text-indigo-600 shadow-sm" title="Rename">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }} className="w-6 h-6 bg-white border border-gray-200 rounded-md hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center text-gray-500 hover:text-rose-600 shadow-sm" title="Delete">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                      </button>
                      {canManage && (
                        <div className="relative" data-visibility-menu>
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === `file-${f.id}` ? null : `file-${f.id}`); }}
                            className="w-6 h-6 bg-gray-100 rounded text-[10px] hover:bg-gray-200 flex items-center justify-center font-bold"
                            title="More options"
                          >
                            ⋮
                          </button>
                          {openMenu === `file-${f.id}` && (
                            <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40 text-left" onClick={(e) => e.stopPropagation()}>
                              <p className="px-3 py-1 text-[10px] text-gray-400 uppercase font-semibold">Visibility</p>
                              <button
                                onClick={() => handleSetVisibility(f.id, "file", "private")}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${!isPublic ? "font-semibold text-indigo-600" : "text-gray-700"}`}
                              >
                                <span>🔒</span>
                                <span>Private</span>
                                {!isPublic && <span className="ml-auto">✓</span>}
                              </button>
                              <button
                                onClick={() => handleSetVisibility(f.id, "file", "public")}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${isPublic ? "font-semibold text-indigo-600" : "text-gray-700"}`}
                              >
                                <span>🌐</span>
                                <span>Public</span>
                                {isPublic && <span className="ml-auto">✓</span>}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredFolders.length === 0 && filteredFiles.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center">
              <div className="text-5xl mb-4">{isSearching ? "🔍" : "📂"}</div>
              <p className="text-gray-700 font-semibold text-base">
                {isSearching ? "No files match your search" : "This folder is empty"}
              </p>
              <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                {isSearching ? "Try a different keyword or clear the search to browse." : "Drag & drop files here, paste an image, or click Upload."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* New Folder Modal */}
      <Modal open={showNewFolder} onClose={() => setShowNewFolder(false)} title="New Folder" size="sm">
        <div className="space-y-4">
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name" autoFocus onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
          <div className="flex gap-2">
            <button onClick={handleCreateFolder} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">Create</button>
            <button onClick={() => setShowNewFolder(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => { setShowUpload(false); setUploadFile(null); setUploadName(""); }} title="Upload File" size="sm">
        <div className="space-y-4">
          <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadFile ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"}`}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setUploadFile(f); setUploadName(f.name.replace(/\.[^.]+$/, "")); } }}>
            {uploadFile ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getIcon(uploadFile.name)}</span>
                <div><p className="text-sm font-medium">{uploadFile.name}</p><p className="text-xs text-gray-400">{fmtSize(uploadFile.size)}</p></div>
                <button type="button" onClick={e => { e.preventDefault(); setUploadFile(null); }} className="text-red-400 hover:text-red-600 text-xs">×</button>
              </div>
            ) : (
              <div className="text-center"><p className="text-sm text-gray-500">Drop file or <span className="text-indigo-600 font-medium">browse</span></p></div>
            )}
            <input type="file" onChange={e => { const f = e.target.files[0]; if (f) { setUploadFile(f); setUploadName(f.name.replace(/\.[^.]+$/, "")); } }} className="hidden" />
          </label>
          <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="File name" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm" />
          <div className="flex gap-2">
            <button onClick={async () => { if (uploadFile) { await handleUpload(uploadFile, uploadName); setShowUpload(false); setUploadFile(null); setUploadName(""); } }} disabled={!uploadFile} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40">Upload</button>
            <button onClick={() => { setShowUpload(false); setUploadFile(null); }} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* File Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4" onClick={closePreview}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getIcon(preview.filename || preview.name)}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{preview.name}</p>
                  <p className="text-[10px] text-gray-400">{preview.filename} · {fmtSize(preview.file_size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a href={previewUrl} download={preview.filename || preview.name} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">Download</a>
                )}
                <button onClick={closePreview} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 min-h-[400px]">
              {previewLoading ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Loading preview...</p>
                </div>
              ) : !previewUrl ? (
                <p className="text-gray-400">Failed to load file</p>
              ) : (() => {
                const fname = preview.filename || preview.name || "";
                if (isImage(fname)) {
                  return <img src={previewUrl} alt={preview.name} className="max-w-full max-h-[78vh] object-contain" />;
                }
                if (isPdf(fname)) {
                  return <iframe src={previewUrl} className="w-full h-[78vh] border-0" />;
                }
                if (isText(fname)) {
                  return <iframe src={previewUrl} className="w-full h-[78vh] border-0 bg-white" />;
                }
                if (["mp4", "webm", "ogg", "mov"].includes(getExt(fname))) {
                  return <video src={previewUrl} controls className="max-w-full max-h-[78vh]" />;
                }
                if (["mp3", "wav", "ogg", "m4a"].includes(getExt(fname))) {
                  return (
                    <div className="text-center">
                      <span className="text-6xl block mb-4">🎵</span>
                      <audio src={previewUrl} controls className="mx-auto" />
                    </div>
                  );
                }
                return (
                  <div className="text-center p-8">
                    <span className="text-6xl block mb-4">{getIcon(fname)}</span>
                    <p className="text-sm font-medium text-gray-800 mb-1">{fname}</p>
                    <p className="text-gray-400 text-sm mb-4">{fmtSize(preview.file_size)}</p>
                    <a href={previewUrl} download={fname} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 inline-block">Download File</a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
