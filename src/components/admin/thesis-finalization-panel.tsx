"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2 } from "lucide-react";

type ThesisFinalizationItem = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  corrections: Array<{
    id: string;
    correctionType: string;
    description: string | null;
    isApproved: boolean;
    createdAt: string | Date;
    documents: Array<{
      id: string;
      fileName: string;
      storagePath: string;
    }>;
  }>;
};

export function ThesisFinalizationPanel({
  theses,
}: {
  theses: ThesisFinalizationItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPatch(
    path: string,
    successMessage: string,
    busyKey: string,
  ) {
    setBusyId(busyKey);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "PATCH",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Action failed.");
      }

      setMessage(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Finalize Theses</h2>
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          <p>{error}</p>
        </div>
      )}

      {message && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          <p>{message}</p>
        </div>
      )}

      <div className="space-y-6">
        {theses.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No thesis records currently need final archiving.
            </CardContent>
          </Card>
        ) : (
          theses.map((thesis) => {
            const hasApprovedCorrection = thesis.corrections.some(
              (correction) => correction.isApproved,
            );
            const canArchive =
              thesis.status === "FINAL_ARCHIVE" ||
              (thesis.status === "CORRECTIONS_REQUIRED" &&
                hasApprovedCorrection);

            return (
              <Card key={thesis.id}>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <Badge variant="secondary" className="uppercase mb-2">
                        {thesis.status.replaceAll("_", " ")}
                      </Badge>
                      <CardTitle className="text-xl">{thesis.title}</CardTitle>
                      <CardDescription>
                        Candidate: {thesis.student.user.displayName} • {thesis.student.user.email}
                      </CardDescription>
                    </div>

                    <Button
                      disabled={!canArchive || busyId === `archive-${thesis.id}`}
                      onClick={() =>
                        void runPatch(
                          `/api/theses/${thesis.id}/archive`,
                          "Thesis successfully archived and student graduated.",
                          `archive-${thesis.id}`,
                        )
                      }
                    >
                      {busyId === `archive-${thesis.id}`
                        ? "Archiving..."
                        : "Archive & Graduate"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                      Corrections
                    </h4>

                    {thesis.corrections.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">No corrections submitted</p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {thesis.corrections.map((correction) => (
                          <div
                            key={correction.id}
                            className="flex flex-col justify-between rounded-md border p-4 space-y-4"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  {correction.correctionType} Correction
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(correction.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              {correction.description && (
                                <p className="text-sm italic text-muted-foreground">
                                  &quot;{correction.description}&quot;
                                </p>
                              )}

                              <div className="space-y-2">
                                {correction.documents.map((doc) => (
                                  <div key={doc.id} className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium">{doc.fileName}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <Button
                              variant={correction.isApproved ? "secondary" : "outline"}
                              disabled={correction.isApproved || busyId === `approve-${correction.id}`}
                              onClick={() =>
                                void runPatch(
                                  `/api/theses/${thesis.id}/corrections/${correction.id}/approve`,
                                  "Correction approved.",
                                  `approve-${correction.id}`,
                                )
                              }
                              className="w-full mt-4"
                            >
                              {correction.isApproved ? (
                                <>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Verified Approved
                                </>
                              ) : busyId === `approve-${correction.id}` ? (
                                "Validating..."
                              ) : (
                                "Approve Correction"
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
