"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EvidenceItem = {
  id: string;
  file_url: string;
  created_at: string;
  signed_url?: string | null;
};

export default function EvidenceGallery({ evidence }: { evidence: EvidenceItem[] }) {
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [loadedThumbIds, setLoadedThumbIds] = useState<Record<string, boolean>>({});
  const [previewLoaded, setPreviewLoaded] = useState(false);

  if (evidence.length === 0) {
    return <p className="text-xs text-muted-foreground">No evidence uploaded.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {evidence.map((item) => {
          const src = item.signed_url ?? item.file_url;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPreviewLoaded(false);
                setSelected(item);
              }}
              className="overflow-hidden rounded-xl border border-border/70 bg-muted/20 text-left"
            >
              <div className="relative h-24 w-full">
                {!loadedThumbIds[item.id] ? <div className="absolute inset-0 animate-pulse bg-muted" /> : null}
                <Image
                  src={src}
                  alt="Evidence thumbnail"
                  className="h-24 w-full object-cover"
                  width={250}
                  height={250}
                  onLoad={() => setLoadedThumbIds((prev) => ({ ...prev, [item.id]: true }))}
                />
              </div>
              <p className="truncate px-2 py-1 text-[11px] text-muted-foreground">
                {new Date(item.created_at).toLocaleString()}
              </p>
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Evidence Preview</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="relative">
              {!previewLoaded ? <div className="absolute inset-0 animate-pulse rounded-xl bg-muted" /> : null}
              <Image
                src={selected.signed_url ?? selected.file_url}
                alt="Evidence preview"
                className="max-h-[75vh] w-full rounded-xl object-contain"
                width={800}
                height={600}
                onLoad={() => setPreviewLoaded(true)}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
