"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader } from "@/components/ui/loader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Application = {
  id: string;
  applicantName: string;
  applicantEmail: string;
  programType: string;
  status: string;
  createdAt: string;
};

export function ApplicationListPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchApplications() {
      try {
        const res = await fetch("/api/applications?status=SUBMITTED");
        if (!res.ok) throw new Error("Failed to load applications");
        const data = await res.json();
        setApplications(data.applications);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    void fetchApplications();
  }, []);

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Loader />
        <span>Loading applications...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive-foreground">
        {error}
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pending applications</CardTitle>
          <CardDescription>
            There are currently no new applications waiting for review.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Pending Applications</CardTitle>
        <CardDescription>
          A list of all recently submitted student applications waiting for your approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0 sm:px-6 sm:pb-6">
        <Table className="hidden sm:table">
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow key={app.id}>
                <TableCell>
                  <div className="font-medium">{app.applicantName}</div>
                  <div className="text-sm text-muted-foreground">{app.applicantEmail}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {app.programType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {format(new Date(app.createdAt), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/admin/applications/${app.id}`}>
                      Review
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="divide-y sm:hidden">
          {applications.map((app) => (
            <article key={app.id} className="px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{app.applicantName}</p>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {app.applicantEmail}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {app.programType}
                </Badge>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Submitted {format(new Date(app.createdAt), "MMM d, yyyy")}
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/admin/applications/${app.id}`}>
                    Review
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
