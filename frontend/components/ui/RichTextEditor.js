"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

/**
 * Gmail-style rich text editor with formatting toolbar.
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = "200px" }) {
  const modules = useMemo(() => ({
    toolbar: [
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ color: [] }, { background: [] }],
      ["link"],
      ["clean"],
    ],
  }), []);

  const formats = [
    "bold", "italic", "underline", "strike",
    "list", "color", "background", "link",
  ];

  return (
    <div className="rich-editor-wrapper">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || "Compose your email..."}
      />
      <style jsx global>{`
        .rich-editor-wrapper .ql-container {
          min-height: ${minHeight};
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
        }
        .rich-editor-wrapper .ql-toolbar {
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
          background: #f9fafb;
          border-color: #d1d5db;
        }
        .rich-editor-wrapper .ql-container {
          border-color: #d1d5db;
        }
        .rich-editor-wrapper .ql-editor {
          min-height: ${minHeight};
          line-height: 1.6;
        }
        .rich-editor-wrapper .ql-editor.ql-blank::before {
          color: #9ca3af;
          font-style: normal;
        }
        .rich-editor-wrapper .ql-toolbar button:hover,
        .rich-editor-wrapper .ql-toolbar button.ql-active {
          color: #4f46e5;
        }
        .rich-editor-wrapper .ql-toolbar .ql-stroke {
          stroke: #6b7280;
        }
        .rich-editor-wrapper .ql-toolbar button:hover .ql-stroke,
        .rich-editor-wrapper .ql-toolbar button.ql-active .ql-stroke {
          stroke: #4f46e5;
        }
      `}</style>
    </div>
  );
}
