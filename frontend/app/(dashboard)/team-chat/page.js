"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { getErrorMessage } from "@/lib/errorHandler";

const BACKEND_URL = "http://localhost:8000";
const fileUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
};

const roleColors = {
  admin: "text-red-600 bg-red-50",
  manager: "text-blue-600 bg-blue-50",
  executive: "text-green-600 bg-green-50",
};

const avatarColors = {
  admin: "bg-red-100 text-red-700",
  manager: "bg-blue-100 text-blue-700",
  executive: "bg-green-100 text-green-700",
};

function getInitials(name) {
  return (name || "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function TeamChatPage() {
  const currentUser = useSelector((state) => state.auth.user);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Load rooms
  useEffect(() => {
    api.get("/chat/rooms/").then((r) => {
      const data = r.data.results || r.data;
      setRooms(data);
      if (data.length > 0) setActiveRoom(data.find((r) => r.is_general) || data[0]);
    }).finally(() => setLoadingRooms(false));
  }, []);

  // Load messages when room changes
  useEffect(() => {
    if (!activeRoom) return;
    api.get(`/chat/rooms/${activeRoom.id}/messages/`).then((r) => {
      setMessages(r.data);
      setTimeout(scrollToBottom, 100);
    });
  }, [activeRoom?.id]);

  // Poll for new messages every 3 seconds
  useEffect(() => {
    if (!activeRoom) return;
    pollRef.current = setInterval(() => {
      const lastMsg = messages[messages.length - 1];
      const since = lastMsg?.created_at || "";
      if (since) {
        api.get(`/chat/rooms/${activeRoom.id}/messages/`, { params: { since } }).then((r) => {
          if (r.data.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newMsgs = r.data.filter((m) => !existingIds.has(m.id));
              if (newMsgs.length > 0) {
                setTimeout(scrollToBottom, 100);
                return [...prev, ...newMsgs];
              }
              return prev;
            });
          }
        });
      }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [activeRoom?.id, messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || sending || !activeRoom) return;
    setSending(true);
    try {
      const res = await api.post(`/chat/rooms/${activeRoom.id}/send/`, { content: input.trim(), message_type: "text" });
      setMessages((prev) => [...prev, res.data]);
      setInput("");
      setTimeout(scrollToBottom, 100);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to send")); }
    finally { setSending(false); }
  };

  const detectFileType = (file) => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "file";
  };

  const handleSendFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeRoom) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("message_type", detectFileType(file));
    fd.append("content", file.name);
    try {
      const res = await api.post(`/chat/rooms/${activeRoom.id}/send/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMessages((prev) => [...prev, res.data]);
      setTimeout(scrollToBottom, 100);
    } catch (err) { toast.error(getErrorMessage(err, "Failed to upload")); }
    e.target.value = "";
  };

  // Voice recording
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("message_type", "audio");
        fd.append("content", "Voice message");
        try {
          const res = await api.post(`/chat/rooms/${activeRoom.id}/send/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
          setMessages((prev) => [...prev, res.data]);
          setTimeout(scrollToBottom, 100);
        } catch (err) { toast.error(getErrorMessage(err, "Failed to send voice")); }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) { toast.error(getErrorMessage(err, "Microphone access denied")); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // Group call via Jitsi Meet
  const [inCall, setInCall] = useState(false);
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);

  const startGroupCall = () => {
    setInCall(true);
    // Notify all team members
    notifyCallStarted();
  };

  const endGroupCall = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }
    setInCall(false);
  };

  useEffect(() => {
    if (!inCall || !activeRoom || !jitsiContainerRef.current) return;

    // Load Jitsi external API script (free, no account needed)
    if (window.JitsiMeetExternalAPI) {
      initJitsi();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = initJitsi;
    document.head.appendChild(script);

    function initJitsi() {
      if (!jitsiContainerRef.current) return;
      const roomName = `KriyaCRM_${activeRoom.name.replace(/\s+/g, "_")}_${activeRoom.id.slice(0, 8)}`;
      const jitsiApi = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName,
        parentNode: jitsiContainerRef.current,
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: false,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "desktop", "chat",
            "raisehand", "participants-pane", "tileview",
            "hangup", "fullscreen",
          ],
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
        },
        userInfo: {
          displayName: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : currentUser?.username,
          email: currentUser?.email || "",
        },
      });

      jitsiApi.addEventListener("readyToClose", endGroupCall);
      jitsiApiRef.current = jitsiApi;

      // Notify in chat
      api.post(`/chat/rooms/${activeRoom.id}/send/`, {
        content: `${currentUser?.first_name || "Someone"} started a group call. Join from the call panel!`,
        message_type: "text",
      }).catch(() => {});
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [inCall, activeRoom?.id]);

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      const res = await api.post("/chat/rooms/", { name: newRoomName.trim() });
      setRooms((prev) => [...prev, res.data]);
      setActiveRoom(res.data);
      setShowNewRoom(false);
      setNewRoomName("");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to create room")); }
  };

  const isOwnMessage = (msg) => msg.user === currentUser?.id;
  const isAdminOrManager = currentUser?.role === "admin" || currentUser?.role === "manager";

  // Room edit/delete
  const [editingRoom, setEditingRoom] = useState(null);
  const [editRoomName, setEditRoomName] = useState("");

  const handleEditRoom = (room, e) => {
    e.stopPropagation();
    setEditingRoom(room.id);
    setEditRoomName(room.name);
  };

  const handleSaveRoom = async (roomId) => {
    if (!editRoomName.trim()) return;
    try {
      await api.patch(`/chat/rooms/${roomId}/`, { name: editRoomName.trim() });
      setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, name: editRoomName.trim() } : r));
      if (activeRoom?.id === roomId) setActiveRoom((prev) => ({ ...prev, name: editRoomName.trim() }));
      setEditingRoom(null);
      toast.success("Room renamed");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to rename")); }
  };

  const handleDeleteRoom = async (room, e) => {
    e.stopPropagation();
    if (room.is_general) { toast.error("Cannot delete the General room"); return; }
    if (!confirm(`Delete #${room.name}? All messages will be lost.`)) return;
    try {
      await api.delete(`/chat/rooms/${room.id}/`);
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
      if (activeRoom?.id === room.id) setActiveRoom(rooms.find((r) => r.is_general) || null);
      toast.success("Room deleted");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { msgId, x, y }

  const handleCopyMsg = (content) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied!");
    setContextMenu(null);
  };

  const handleEditMsg = (msg) => {
    setEditingMsg(msg.id);
    setEditText(msg.content);
    setContextMenu(null);
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || !editingMsg) return;
    try {
      await api.patch(`/chat/messages/${editingMsg}/`, { content: editText.trim() });
      setMessages((prev) => prev.map((m) => m.id === editingMsg ? { ...m, content: editText.trim(), is_edited: true } : m));
      setEditingMsg(null);
      setEditText("");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to edit")); }
  };

  const handleDeleteMsg = async (msgId) => {
    setContextMenu(null);
    if (!confirm("Delete this message?")) return;
    try {
      await api.delete(`/chat/messages/${msgId}/`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      toast.success("Message deleted");
    } catch (err) { toast.error(getErrorMessage(err, "Failed to delete")); }
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // Broadcast call notification to all team members
  const notifyCallStarted = async () => {
    try {
      await api.post("/notifications/broadcast/", {
        title: "Group Call Started",
        message: `${currentUser?.first_name || "Someone"} started a group call in #${activeRoom?.name}. Go to Team Chat to join.`,
        notification_type: "alert",
        link: "/team-chat",
      });
    } catch {}
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4">
      {/* Rooms Sidebar */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Team Chat</h3>
          <button onClick={() => setShowNewRoom(true)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Room</button>
        </div>
        {showNewRoom && (
          <div className="p-2 border-b border-gray-200 flex gap-1">
            <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="Room name" className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded outline-none" onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()} />
            <button onClick={handleCreateRoom} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded">Add</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {rooms.map((room) => (
            <div
              key={room.id}
              onClick={() => setActiveRoom(room)}
              className={`group w-full text-left px-3 py-3 border-b border-gray-100 transition-colors cursor-pointer ${
                activeRoom?.id === room.id ? "bg-indigo-50" : "hover:bg-gray-100"
              }`}
            >
              {editingRoom === room.id ? (
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <input value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveRoom(room.id); if (e.key === "Escape") setEditingRoom(null); }} autoFocus className="flex-1 px-2 py-1 text-xs border border-indigo-300 rounded outline-none" />
                  <button onClick={() => handleSaveRoom(room.id)} className="px-1.5 py-1 text-xs bg-indigo-600 text-white rounded">OK</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-lg shrink-0">#</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${activeRoom?.id === room.id ? "text-indigo-700" : "text-gray-800"}`}>{room.name}</p>
                    {room.last_message && (
                      <p className="text-xs text-gray-400 truncate">{room.last_message.user_name}: {room.last_message.content}</p>
                    )}
                  </div>
                  {/* Edit/Delete on hover */}
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
                    <button onClick={(e) => handleEditRoom(room, e)} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Rename">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {!room.is_general && (
                      <button onClick={(e) => handleDeleteRoom(room, e)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Delete room">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Room Header */}
        {activeRoom && (
          <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
            <div>
              <h2 className="font-semibold"># {activeRoom.name}</h2>
              {activeRoom.description && <p className="text-xs text-gray-500">{activeRoom.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              {inCall ? (
                <button onClick={endGroupCall} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
                  End Call
                </button>
              ) : (
                <button onClick={startGroupCall} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  Group Call
                </button>
              )}
            </div>
          </div>
        )}

        {/* Jitsi Call Panel */}
        {inCall && (
          <div className="relative bg-gray-900" style={{ height: "400px" }}>
            <div ref={jitsiContainerRef} className="w-full h-full" />
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => {
            const own = isOwnMessage(msg);
            const showAvatar = i === 0 || messages[i - 1]?.user !== msg.user;
            const canEdit = own && msg.message_type === "text";
            const canDelete = own || isAdminOrManager;
            return (
              <div key={msg.id} className={`group relative flex ${own ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[70%] ${own ? "flex-row-reverse" : ""}`}>
                  {/* Avatar */}
                  {showAvatar ? (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColors[msg.user_role] || "bg-gray-100 text-gray-700"}`}>
                      {getInitials(msg.user_name)}
                    </div>
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}

                  <div>
                    {showAvatar && (
                      <div className={`flex items-center gap-2 mb-0.5 ${own ? "justify-end" : ""}`}>
                        <span className="text-xs font-semibold text-gray-700">{msg.user_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleColors[msg.user_role] || "text-gray-500 bg-gray-50"}`}>{msg.user_role}</span>
                        <span className="text-[10px] text-gray-400">{format(new Date(msg.created_at), "h:mm a")}</span>
                        {msg.is_edited && <span className="text-[10px] text-gray-400 italic">(edited)</span>}
                      </div>
                    )}

                    {/* Edit mode */}
                    {editingMsg === msg.id ? (
                      <div className="flex items-center gap-1">
                        <input value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingMsg(null); }} autoFocus className="flex-1 px-3 py-2 text-sm border border-indigo-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={handleSaveEdit} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg">Save</button>
                        <button onClick={() => setEditingMsg(null)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm relative ${own ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-800"}`}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY }); }}
                      >
                        {/* Image */}
                        {msg.message_type === "image" && msg.file && (
                          <img src={fileUrl(msg.file)} alt={msg.filename} className="max-w-xs rounded-lg mb-1 cursor-pointer" onClick={() => window.open(fileUrl(msg.file), "_blank")} />
                        )}
                        {/* Video */}
                        {msg.message_type === "video" && msg.file && (
                          <video src={fileUrl(msg.file)} controls className="max-w-xs rounded-lg mb-1" />
                        )}
                        {/* Audio / Voice */}
                        {msg.message_type === "audio" && msg.file && (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            <audio src={fileUrl(msg.file)} controls className="h-8" />
                          </div>
                        )}
                        {/* File */}
                        {msg.message_type === "file" && msg.file && (
                          <a href={fileUrl(msg.file)} target="_blank" rel="noreferrer" className={`flex items-center gap-2 py-1 ${own ? "text-indigo-100" : "text-indigo-600"} text-xs font-medium`}>
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {msg.filename || "Download file"}
                          </a>
                        )}
                        {/* Text */}
                        {msg.content && msg.message_type === "text" && (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    )}

                    {/* Hover action buttons */}
                    {editingMsg !== msg.id && (
                      <div className={`flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${own ? "justify-end" : "justify-start"}`}>
                        <button onClick={() => handleCopyMsg(msg.content)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Copy">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                        {canEdit && (
                          <button onClick={() => handleEditMsg(msg)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Edit">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDeleteMsg(msg.id)} className="p-0.5 text-gray-400 hover:text-red-500" title="Delete">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeRoom && (
          <div className="border-t border-gray-200 p-3 bg-white">
            <form onSubmit={handleSend} className="flex items-center gap-2">
              {/* Attach file */}
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Attach file/image/video">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleSendFile} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />

              {/* Voice record */}
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`p-2 rounded-lg transition-colors ${recording ? "text-red-600 bg-red-50 animate-pulse" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                title={recording ? "Stop recording" : "Record voice message"}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </button>

              {recording ? (
                <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-red-600 font-medium">Recording... Click mic to stop</span>
                </div>
              ) : (
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Message #${activeRoom.name}...`}
                  disabled={sending}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:opacity-50 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
              )}
              <button type="submit" disabled={sending || !input.trim() || recording} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 text-sm">
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
