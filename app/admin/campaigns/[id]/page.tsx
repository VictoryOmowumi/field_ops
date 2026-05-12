"use client";

import { useParams } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { CampaignDetailsSections } from "@/components/admin/campaigns/CampaignDetailsSections";
import { AssignRepsDialog, ShareCampaignDialog } from "@/components/admin/campaigns/CampaignDialogs";
import { useCampaignDetailsPage } from "@/components/admin/campaigns/useCampaignDetailsPage";
import { supabaseClient } from "@/lib/supabase/client";

export default function CampaignDetailsPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params?.id;

  const vm = useCampaignDetailsPage(campaignId);

  if (vm.loading) {
    return (
      <div className="rounded-4xl bg-card p-12 text-center shadow-sm ring-1 ring-border/60">
        <div className="mx-auto w-full container space-y-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!vm.campaign) {
    return (
      <div className="rounded-4xl bg-card p-8 text-center shadow-sm ring-1 ring-border/60">
        Campaign not found.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <CampaignDetailsSections
        campaign={vm.campaign}
        summary={vm.summary}
        mapPoints={vm.mapPoints}
        supervisorNames={vm.supervisorNames}
        supervisorRows={vm.supervisorRows}
        assignedRepRows={vm.assignedRepRows}
        evidence={vm.evidence}
        exportingActivities={vm.exportingActivities}
        launching={vm.launching}
        onExportActivities={() => void vm.downloadCampaignActivitiesExport()}
        onLaunchCampaign={() => void vm.launchCampaign()}
        onOpenShareDialog={() => vm.setShareDialogOpen(true)}
        onOpenAssignDialog={vm.openAssignDialog}
        activitySearch={vm.activitySearch}
        onActivitySearchChange={vm.setActivitySearch}
        activityStatusFilter={vm.activityStatusFilter}
        onActivityStatusFilterChange={vm.setActivityStatusFilter}
        onApplyFilters={async () => {
          const { data } = await supabaseClient.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          vm.setActivityPage(1);
          await vm.loadActivities(token, 1, vm.activitySearch, vm.activityStatusFilter);
        }}
        activities={vm.activities}
        activityPage={vm.activityPage}
        activitiesTotal={vm.activitiesTotal}
        onPreviousPage={async () => {
          const { data } = await supabaseClient.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          const nextPage = Math.max(1, vm.activityPage - 1);
          vm.setActivityPage(nextPage);
          await vm.loadActivities(token, nextPage, vm.activitySearch, vm.activityStatusFilter);
        }}
        onNextPage={async () => {
          const { data } = await supabaseClient.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          const nextPage = vm.activityPage + 1;
          vm.setActivityPage(nextPage);
          await vm.loadActivities(token, nextPage, vm.activitySearch, vm.activityStatusFilter);
        }}
      />

      <AssignRepsDialog
        open={vm.assignDialogOpen}
        onOpenChange={vm.setAssignDialogOpen}
        selectedSupervisors={vm.selectedSupervisors}
        onToggleSupervisor={vm.toggleSupervisor}
        supervisors={vm.supervisors}
        agents={vm.agents}
        selectedAgents={vm.selectedAgents}
        onToggleAgent={vm.toggleAgent}
        onCancel={() => {
          vm.resetAssignDialogFromCurrent();
          vm.setAssignDialogOpen(false);
        }}
        onSave={vm.saveAssignments}
        savingAssignments={vm.savingAssignments}
        registerRepOpen={vm.registerRepOpen}
        onRegisterRepOpenChange={vm.setRegisterRepOpen}
        onOpenRegisterRep={vm.openRegisterRepDialog}
        repForm={vm.registerRepForm}
        onRepFormChange={vm.setRegisterRepForm}
        registerRepSubmitting={vm.registerRepSubmitting}
        registerRepError={vm.registerRepError}
        registerCampaignOptions={vm.registerCampaignOptions}
        onSubmitRegisterRep={vm.submitRegisterRepFromAssignDialog}
      />

      <ShareCampaignDialog
        open={vm.shareDialogOpen}
        onOpenChange={(open) => {
          vm.setShareDialogOpen(open);
          if (open) void vm.refreshShareLinks();
        }}
        shareExpiresAt={vm.shareExpiresAt}
        onShareExpiresAtChange={vm.setShareExpiresAt}
        shareRecipientEmail={vm.shareRecipientEmail}
        onShareRecipientEmailChange={vm.setShareRecipientEmail}
        creatingShareLink={vm.creatingShareLink}
        sendingShareLink={vm.sendingShareLink}
        onCreateShareLink={(sendEmail) => void vm.createShareLink(sendEmail)}
        generatedShareUrl={vm.generatedShareUrl}
        onCopyShareUrl={(url) => void vm.copyShareUrl(url)}
        shareLinks={vm.shareLinks}
        onRevokeShareLink={(shareId) => void vm.revokeShareLink(shareId)}
      />
    </div>
  );
}
