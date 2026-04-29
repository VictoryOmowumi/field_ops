"use client";

import { useEffect, useMemo, useState } from "react";

type PhotoCaptureProps = {
  onSelect?: (file: File) => void;
};

export default function PhotoCapture({ onSelect }: PhotoCaptureProps) {
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <label className="block text-sm font-medium">Photo Evidence</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const selectedFile = event.target.files?.[0];
          if (selectedFile) {
            setFile(selectedFile);
            if (onSelect) {
              onSelect(selectedFile);
            }
          }
        }}
      />
      {previewUrl ? (
        <div className="rounded-xl border border-border/70 bg-muted/30 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Evidence preview" className="h-40 w-full rounded-lg object-cover" />
          <p className="mt-2 text-xs text-muted-foreground">{file?.name}</p>
        </div>
      ) : null}
    </div>
  );
}
