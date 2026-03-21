import "./globals.css";
import { Toaster } from "react-hot-toast";
import ReduxProvider from "@/lib/ReduxProvider";

export const metadata = {
  title: "GTIP - Global Trade Intelligence Platform",
  description: "Kriya Global Trade Intelligence Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <ReduxProvider>
          {children}
          <Toaster position="top-right" />
        </ReduxProvider>
      </body>
    </html>
  );
}
