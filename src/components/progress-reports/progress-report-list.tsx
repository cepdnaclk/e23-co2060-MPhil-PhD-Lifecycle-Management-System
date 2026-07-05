"use client";

import useSWR from "swr";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ProgressReportDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  createdAt: string | Date;
};

type ProgressReportSummary = {
  id: string;
  periodLabel: string;
  narrative: string;
  isSupervisorSignedOff: boolean;
  isOverdue: boolean;
  createdAt: string | Date;
  documents: ProgressReportDocument[];
};

async function fetchReports(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load reports");
  const data = await response.json();
  return data.reports as ProgressReportSummary[];
}

export function ProgressReportList() {
  const { data: reports, error, isLoading } = useSWR(
    "/api/student/progress-reports",
    fetchReports
  );

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-md border bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm font-medium">
        <p>Unable to load your progress reports.</p>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="mt-8 rounded-md border border-dashed p-12 text-center">
        <h3 className="text-lg font-bold">No reports yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Submit your first progress report to get started.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard/student/progress-reports/submit">
            Submit first report
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {report.periodLabel}
              </p>
              <CardTitle>Progress Report</CardTitle>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                {report.isOverdue && (
                  <Badge variant="destructive">
                    Overdue
                  </Badge>
                )}
                <Badge variant={report.isSupervisorSignedOff ? "default" : "secondary"}>
                  {report.isSupervisorSignedOff ? "Signed Off" : "Pending Sign-off"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Submitted {new Date(report.createdAt).toLocaleDateString()}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="line-clamp-2 text-sm text-foreground">
              {report.narrative}
            </p>
            {report.documents.length > 0 && (
              <p className="mt-3 break-all text-xs text-muted-foreground">
                Attached PDF: {report.documents.map((document) => document.fileName).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
