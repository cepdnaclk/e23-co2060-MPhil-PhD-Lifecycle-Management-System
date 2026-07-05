"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
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

type ApplicationDetails = {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  researchArea: string;
  statementOfPurpose: string;
  programType: string;
  status: string;
  createdAt: string;
  documents: {
    id: string;
    fileName: string;
    mimeType: string;
  }[];
};

export function ApplicationReviewPanel({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [application, setApplication] = useState<ApplicationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    type: "ADMITTED" | "REJECTED" | null;
  }>({ show: false, type: null });

  useEffect(() => {
    async function fetchDetails() {
      try {
        const res = await fetch(`/api/applications/${applicationId}`);
        if (!res.ok) throw new Error("Failed to load application details");
        const data = await res.json();
        setApplication(data.application);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    void fetchDetails();
  }, [applicationId]);

  const handleDownload = async (docId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/applications/${applicationId}/documents/${docId}/download`);
      if (!res.ok) throw new Error("Failed to get download link");
      const data = await res.json();

      // Open the signed URL in a new tab
      window.open(data.downloadUrl, "_blank");
    } catch (err) {
      alert("Failed to download document. Please try again.");
    }
  };

  const handleUpdateStatus = async () => {
    const status = showConfirmModal.type;
    if (!status) return;

    setIsUpdating(true);
    setShowConfirmModal({ show: false, type: null });

    try {
      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update status");
      }

      router.push("/dashboard/admin/applications");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "An error occurred updating the status.");
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col space-y-6">
        <div className="h-8 w-1/3 rounded bg-transparent"></div>
        <div className="h-64 w-full rounded-2xl bg-transparent"></div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <Card>
        <CardContent className="pt-6">
          {error || "Not found"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <Dialog
        open={showConfirmModal.show}
        onOpenChange={(open) => {
          if (!open) setShowConfirmModal({ show: false, type: null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showConfirmModal.type === "ADMITTED" ? "Confirm Admission" : "Confirm Rejection"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {showConfirmModal.type === "ADMITTED" ? "admit" : "reject"} <strong>{application.applicantName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal({ show: false, type: null })}>
              Cancel
            </Button>
            <Button
              variant={showConfirmModal.type === "ADMITTED" ? "default" : "destructive"}
              onClick={handleUpdateStatus}
            >
              Yes, Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Review Application</h2>
        <Button variant="outline" asChild>
          <Link href="/dashboard/admin/applications">
            &larr; Back to List
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl">{application.applicantName}</CardTitle>
              <CardDescription className="mt-2 text-base">
                {application.applicantEmail} • {application.applicantPhone || "No phone provided"}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="uppercase">
              {application.programType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Research Area</h3>
                <div className="rounded-md border bg-muted/50 p-4 text-base">
                  {application.researchArea || "Not specified"}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Statement of Purpose</h3>
                <div className="rounded-md border bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {application.statementOfPurpose || "No statement provided."}
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supporting Documents</h3>
              <div className="flex-1 rounded-md border p-0">
                {application.documents.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground italic">No documents attached.</div>
                ) : (
                  <div className="divide-y">
                    {application.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4">
                        <div className="flex items-center space-x-4 overflow-hidden">
                          <svg className="h-6 w-6 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="truncate font-medium text-sm" title={doc.fileName}>
                            {doc.fileName}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.id, doc.fileName)}
                        >
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col-reverse justify-end gap-4 border-t pt-6 sm:flex-row">
          <Button
            variant="destructive"
            onClick={() => setShowConfirmModal({ show: true, type: "REJECTED" })}
            disabled={isUpdating}
          >
            Reject Application
          </Button>
          <Button
            onClick={() => setShowConfirmModal({ show: true, type: "ADMITTED" })}
            disabled={isUpdating}
          >
            {isUpdating ? "Processing..." : "Admit Student"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
