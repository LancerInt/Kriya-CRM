"use client";
import { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";
import Modal from "@/components/ui/Modal";

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
    if (!confirm("Delete this folder and all its contents?")) return;
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
    if (!confirm("Delete this file?")) return;
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
  // set-visibility action. Optimistic UI update + reload to stay in sync.
  const handleSetVisibility = async (id, type, value) => {
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">{folders.length} folder{folders.length !== 1 ? "s" : ""} · {files.length} file{files.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewFolder(true)} className="px-3 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-1">📁 New Folder</button>
          <button onClick={() => setShowUpload(true)} className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-1">⬆ Upload</button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-4 text-sm">
        <button onClick={() => navigateToBreadcrumb(-1)} className={`px-2 py-1 rounded hover:bg-gray-100 ${!currentFolder ? "font-semibold text-indigo-600" : "text-gray-500"}`}>📁 Root</button>
        {breadcrumbs.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1">
            <span className="text-gray-300">/</span>
            <button onClick={() => navigateToBreadcrumb(i)} className={`px-2 py-1 rounded hover:bg-gray-100 ${i === breadcrumbs.length - 1 ? "font-semibold text-indigo-600" : "text-gray-500"}`}>{b.name}</button>
          </span>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all files across all folders..." className="w-full max-w-md px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 mb-4" />
      {isSearching && <p className="text-xs text-gray-400 mb-3">Showing {filteredFiles.length} result{filteredFiles.length !== 1 ? "s" : ""} for "{search}"</p>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : (
        <div>
          {/* Folders */}
          {filteredFolders.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredFolders.map(f => {
                  const canManage = isAdminOrManager || f.created_by === currentUser?.id;
                  const isPublic = f.visibility === "public";
                  return (
                  <div key={f.id} onDoubleClick={() => navigateToFolder(f)} className="group bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors relative">
                    {/* Visibility badge — always visible (small pill in top-left corner) */}
                    <span
                      className={`absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                        isPublic
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                      title={isPublic ? "Visible to everyone" : "Visible to you + admin/manager"}
                    >
                      {isPublic ? "🌐 PUBLIC" : "🔒 PRIVATE"}
                    </span>
                    <div className="text-center">
                      <span className="text-4xl">📁</span>
                      {renaming === `folder-${f.id}` ? (
                        <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={() => handleRename(f.id, "folder")} onKeyDown={e => { if (e.key === "Enter") handleRename(f.id, "folder"); if (e.key === "Escape") setRenaming(null); }} autoFocus className="w-full text-center text-sm mt-1 border border-indigo-300 rounded px-1 outline-none" />
                      ) : (
                        <p className="text-sm font-medium text-gray-800 mt-1 truncate">{f.name}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{f.file_count} file{f.file_count !== 1 ? "s" : ""} · {f.subfolder_count} folder{f.subfolder_count !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setRenaming(`folder-${f.id}`); setRenameVal(f.name); }} className="w-6 h-6 bg-gray-100 rounded text-[10px] hover:bg-gray-200" title="Rename">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }} className="w-6 h-6 bg-red-50 rounded text-[10px] hover:bg-red-100" title="Delete">🗑️</button>
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
              <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Files</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredFiles.map(f => {
                  const canManage = isAdminOrManager || f.uploaded_by === currentUser?.id;
                  const isPublic = f.visibility === "public";
                  return (
                  <div key={f.id} onClick={() => openPreview(f)} className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors relative cursor-pointer">
                    {/* Visibility badge */}
                    <span
                      className={`absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full z-10 ${
                        isPublic
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : "bg-gray-100 text-gray-600 border border-gray-200"
                      }`}
                      title={isPublic ? "Visible to everyone" : "Visible to you + admin/manager"}
                    >
                      {isPublic ? "🌐" : "🔒"}
                    </span>
                    <div className="text-center">
                      {isImage(f.filename || f.name) && f.file ? (
                        <div className="w-full h-20 mb-1 flex items-center justify-center overflow-hidden rounded-lg bg-gray-50">
                          <img src={f.file.startsWith("http") ? f.file : BACKEND + f.file} alt={f.name} className="max-h-20 max-w-full object-contain" />
                        </div>
                      ) : (
                        <span className="text-4xl">{getIcon(f.filename || f.name)}</span>
                      )}
                      {renaming === `file-${f.id}` ? (
                        <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={() => handleRename(f.id, "file")} onKeyDown={e => { if (e.key === "Enter") handleRename(f.id, "file"); if (e.key === "Escape") setRenaming(null); }} autoFocus className="w-full text-center text-sm mt-1 border border-indigo-300 rounded px-1 outline-none" />
                      ) : (
                        <p className="text-sm font-medium text-gray-800 mt-1 truncate" title={f.name}>{f.name}</p>
                      )}
                      <p className="text-[10px] text-gray-400">{fmtSize(f.file_size)}{isSearching && f.folder_name ? ` · 📁 ${f.folder_name}` : ""}</p>
                      <p className="text-[10px] text-gray-400">{f.created_at ? format(new Date(f.created_at), "MMM d, yyyy") : ""}</p>
                    </div>
                    <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                      {f.file && <a href={f.file} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="w-6 h-6 bg-indigo-50 rounded text-[10px] hover:bg-indigo-100 flex items-center justify-center" title="Download">⬇</a>}
                      <button onClick={(e) => { e.stopPropagation(); setRenaming(`file-${f.id}`); setRenameVal(f.name); }} className="w-6 h-6 bg-gray-100 rounded text-[10px] hover:bg-gray-200" title="Rename">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id); }} className="w-6 h-6 bg-red-50 rounded text-[10px] hover:bg-red-100" title="Delete">🗑️</button>
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
            <div className="text-center py-16">
              <span className="text-5xl mb-4 block">📂</span>
              <p className="text-gray-500 font-medium">This folder is empty</p>
              <p className="text-sm text-gray-400 mt-1">Drag & drop files here, paste, or click Upload</p>
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
