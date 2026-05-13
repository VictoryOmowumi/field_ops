"use client";

import { Copy, Link2, Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { nigeriaLocations } from "@/data/nigeria-locations";
import type { CampaignShareLink } from "@/types/campaign-intelligence";
import type { RepFormValues } from "@/lib/admin/rep-form";

type UserLite = {
  id: string;
  name: string;
  displayName?: string;
  email?: string | null;
  status?: "active" | "inactive" | "invited" | "suspended";
};

type AssignRepsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSupervisors: string[];
  onToggleSupervisor: (userId: string) => void;
  supervisors: UserLite[];
  agents: UserLite[];
  selectedAgents: string[];
  onToggleAgent: (userId: string) => void;
  onCancel: () => void;
  onSave: () => void;
  savingAssignments: boolean;
  registerRepOpen: boolean;
  onRegisterRepOpenChange: (open: boolean) => void;
  onOpenRegisterRep: () => void;
  repForm: RepFormValues;
  onRepFormChange: (next: RepFormValues) => void;
  registerRepSubmitting: boolean;
  registerRepError: string | null;
  registerCampaignOptions: Array<{ id: string; name: string }>;
  onSubmitRegisterRep: () => void;
};

export function AssignRepsDialog({
  open,
  onOpenChange,
  selectedSupervisors,
  onToggleSupervisor,
  supervisors,
  agents,
  selectedAgents,
  onToggleAgent,
  onCancel,
  onSave,
  savingAssignments,
  registerRepOpen,
  onRegisterRepOpenChange,
  onOpenRegisterRep,
  repForm,
  onRepFormChange,
  registerRepSubmitting,
  registerRepError,
  registerCampaignOptions,
  onSubmitRegisterRep,
}: AssignRepsDialogProps) {
  const location = nigeriaLocations.find((item) => item.state === repForm.selectedState);
  const supervisorIds = supervisors.map((user) => user.id);

  function handleSupervisorValueChange(next: string[]) {
    const currentSet = new Set(selectedSupervisors);
    const nextSet = new Set(next);
    for (const id of supervisorIds) {
      const inCurrent = currentSet.has(id);
      const inNext = nextSet.has(id);
      if (inCurrent !== inNext) onToggleSupervisor(id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl! max-h-[80vh]! overflow-y-auto!">
        <DialogHeader>
          <DialogTitle>Assign Supervisors & Reps</DialogTitle>
          <DialogDescription>
            Link supervisors and field agents to this campaign without leaving this page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="max-w-full">
            <p className="mb-2 text-sm font-medium">Assigned supervisors</p>
            <Combobox
              items={supervisorIds}
              multiple
              value={selectedSupervisors}
              onValueChange={handleSupervisorValueChange}
            >
              <ComboboxChips>
                <ComboboxValue>
                  {selectedSupervisors.map((id) => {
                    const found = supervisors.find((item) => item.id === id);
                    return <ComboboxChip key={id}>{found?.displayName ?? found?.name ?? id}</ComboboxChip>;
                  })}
                </ComboboxValue>
                <ComboboxChipsInput placeholder="Search and select supervisors..." />
              </ComboboxChips>
              <ComboboxContent>
                {supervisors.length === 0 ? <ComboboxEmpty>No supervisors found.</ComboboxEmpty> : null}
                <ComboboxList>
                  {(id) => {
                    const found = supervisors.find((item) => item.id === id);
                    return <ComboboxItem key={id} value={id}>{found?.displayName ?? found?.name ?? id}</ComboboxItem>;
                  }}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Assign</th>
                  <th className="px-4 py-3 text-left font-medium">Rep</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                      No agents found yet. Use Register New Rep to create and invite one now.
                    </td>
                  </tr>
                ) : (
                  agents.map((rep) => (
                    <tr key={rep.id} className="border-t border-border">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(rep.id)}
                          onChange={() => onToggleAgent(rep.id)}
                        />
                      </td>
                      <td className="px-4 py-4 font-medium">{rep.displayName ?? rep.name}</td>
                      <td className="px-4 py-4 text-muted-foreground">{rep.email ?? "-"}</td>
                      <td className="px-4 py-4">
                        <Badge className={`rounded-full ${statusBadgeClass(rep.status ?? "active")}`}>
                          {rep.status ?? "active"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" className="rounded-full" onClick={onOpenRegisterRep}>
              Register New Rep
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="rounded-full px-6" disabled={savingAssignments} onClick={onSave}>
            {savingAssignments ? "Saving..." : "Save Assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={registerRepOpen} onOpenChange={onRegisterRepOpenChange}>
        <DialogContent className="max-w-4xl! max-h-[80vh]! overflow-y-auto!">
          <DialogHeader>
            <DialogTitle>Register New Rep</DialogTitle>
            <DialogDescription>
              Registration creates rep profile and sends invite.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {registerRepError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {registerRepError}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name">
                <Input value={repForm.fullName} onChange={(event) => onRepFormChange({ ...repForm, fullName: event.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={repForm.phone} onChange={(event) => onRepFormChange({ ...repForm, phone: event.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={repForm.email} onChange={(event) => onRepFormChange({ ...repForm, email: event.target.value })} />
              </Field>
              <Field label="Assigned supervisor">
                <Select value={repForm.assignedSupervisorUserId} onValueChange={(value) => onRepFormChange({ ...repForm, assignedSupervisorUserId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {supervisors.map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.displayName ?? user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="State">
                <Select value={repForm.selectedState} onValueChange={(value) => onRepFormChange({ ...repForm, selectedState: value, selectedLga: "" })}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {nigeriaLocations.map((item) => (
                      <SelectItem key={item.state} value={item.state}>{item.state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="LGA">
                <Select value={repForm.selectedLga} onValueChange={(value) => onRepFormChange({ ...repForm, selectedLga: value })} disabled={!repForm.selectedState}>
                  <SelectTrigger><SelectValue placeholder="Select LGA" /></SelectTrigger>
                  <SelectContent>
                    {location?.lgas.map((lga) => (
                      <SelectItem key={lga} value={lga}>{lga}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Target outlets">
                <Input type="number" value={repForm.targetOutlets} onChange={(event) => onRepFormChange({ ...repForm, targetOutlets: event.target.value })} />
              </Field>
              <Field label="Target conversions">
                <Input type="number" value={repForm.targetConversions} onChange={(event) => onRepFormChange({ ...repForm, targetConversions: event.target.value })} />
              </Field>
              <div className="space-y-1 md:col-span-2">
                <p className="text-sm font-medium">Assign campaigns (multi-select)</p>
                <Combobox
                  items={registerCampaignOptions.map((campaign) => campaign.id)}
                  multiple
                  value={repForm.selectedCampaignIds}
                  onValueChange={(value) => onRepFormChange({ ...repForm, selectedCampaignIds: value })}
                >
                  <ComboboxChips>
                    <ComboboxValue>
                      {repForm.selectedCampaignIds.map((id) => {
                        const found = registerCampaignOptions.find((item) => item.id === id);
                        return <ComboboxChip key={id}>{found?.name ?? id}</ComboboxChip>;
                      })}
                    </ComboboxValue>
                    <ComboboxChipsInput placeholder="Assign campaign..." />
                  </ComboboxChips>
                  <ComboboxContent>
                    {registerCampaignOptions.length === 0 ? <ComboboxEmpty>No campaigns found.</ComboboxEmpty> : null}
                    <ComboboxList>
                      {(id) => {
                        const found = registerCampaignOptions.find((item) => item.id === id);
                        return <ComboboxItem key={id} value={id}>{found?.name ?? id}</ComboboxItem>;
                      }}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            </div>

            <Field label="Notes">
              <Textarea value={repForm.notes} onChange={(event) => onRepFormChange({ ...repForm, notes: event.target.value })} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onRegisterRepOpenChange(false)} disabled={registerRepSubmitting}>
              Cancel
            </Button>
            <Button type="button" className="rounded-full" onClick={onSubmitRegisterRep} disabled={registerRepSubmitting}>
              {registerRepSubmitting ? "Registering..." : "Register Rep"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

type ShareCampaignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareExpiresAt: string;
  onShareExpiresAtChange: (value: string) => void;
  shareRecipientEmail: string;
  onShareRecipientEmailChange: (value: string) => void;
  creatingShareLink: boolean;
  sendingShareLink: boolean;
  onCreateShareLink: (sendEmail: boolean) => void;
  generatedShareUrl: string | null;
  onCopyShareUrl: (url: string) => void;
  shareLinks: CampaignShareLink[];
  onRevokeShareLink: (shareId: string) => void;
};

export function ShareCampaignDialog({
  open,
  onOpenChange,
  shareExpiresAt,
  onShareExpiresAtChange,
  shareRecipientEmail,
  onShareRecipientEmailChange,
  creatingShareLink,
  sendingShareLink,
  onCreateShareLink,
  generatedShareUrl,
  onCopyShareUrl,
  shareLinks,
  onRevokeShareLink,
}: ShareCampaignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl! max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Campaign</DialogTitle>
          <DialogDescription>
            Generate revocable read-only links for client stakeholders to monitor campaign progress.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="ml-1 mb-1 text-sm font-medium">Expiry date</p>
            <input
              type="date"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={shareExpiresAt}
              onChange={(event) => onShareExpiresAtChange(event.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <p className="ml-1 mb-1 text-sm font-medium">Recipient email (optional)</p>
            <input
              type="email"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              placeholder="client@example.com"
              value={shareRecipientEmail}
              onChange={(event) => onShareRecipientEmailChange(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="rounded-full" disabled={creatingShareLink} onClick={() => onCreateShareLink(false)}>
            <span className="inline-flex items-center gap-2">
              <Link2 className="size-4" />
              {creatingShareLink ? "Generating..." : "Generate Link"}
            </span>
          </Button>
          <Button variant="outline" className="rounded-full" disabled={sendingShareLink} onClick={() => onCreateShareLink(true)}>
            <span className="inline-flex items-center gap-2">
              <Mail className="size-4" />
              {sendingShareLink ? "Sending..." : "Send via Email"}
            </span>
          </Button>
        </div>
        {generatedShareUrl ? (
          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Latest link:</span>
              <span className="break-all text-foreground">{generatedShareUrl}</span>
              <button
                type="button"
                onClick={() => onCopyShareUrl(generatedShareUrl)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Copy className="size-3.5" />
                Copy
              </button>
            </div>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-3xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Recipient</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Views</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shareLinks.length === 0 ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-6 text-muted-foreground" colSpan={5}>No share links generated yet.</td>
                </tr>
              ) : (
                shareLinks.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-4">{item.recipientEmail ?? "-"}</td>
                    <td className="px-4 py-4 capitalize">{item.status}</td>
                    <td className="px-4 py-4">{new Date(item.expiresAt).toLocaleString()}</td>
                    <td className="px-4 py-4">{item.viewCount}</td>
                    <td className="px-4 py-4">
                      {item.status === "active" ? (
                        <Button variant="outline" className="rounded-full" onClick={() => onRevokeShareLink(item.id)}>
                          Revoke
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function statusBadgeClass(status: string) {
  if (status === "active") return "bg-emerald-500/10 text-emerald-600";
  if (status === "invited") return "bg-amber-500/10 text-amber-600";
  if (status === "suspended") return "bg-red-500/10 text-red-600";
  return "bg-muted text-muted-foreground";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
