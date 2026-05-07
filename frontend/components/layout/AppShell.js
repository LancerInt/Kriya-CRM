"use client";
import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import GlobalTooltip from "@/components/ui/GlobalTooltip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PromptDialog from "@/components/ui/PromptDialog";
import { fetchMe } from "@/store/slices/authSlice";

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    if (!user) {
      dispatch(fetchMe());
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated && !localStorage.getItem("access_token")) {
      router.push("/login");
    }
  }, [isAuthenticated]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
      {/* Global modern tooltip — replaces every native title= popup */}
      <GlobalTooltip />
      {/* Global in-app confirm dialog — replaces every native window.confirm */}
      <ConfirmDialog />
      {/* Global in-app prompt dialog — replaces every native window.prompt */}
      <PromptDialog />
    </div>
  );
}
