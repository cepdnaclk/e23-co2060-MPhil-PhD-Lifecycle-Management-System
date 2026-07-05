"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format } from "date-fns";
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
      <div className="flex animate-pulse flex-col space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-24 w-full rounded-2xl border border-black bg-white"
          ></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
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
    <Card>
      <CardHeader>
        <CardTitle>Pending Applications</CardTitle>
        <CardDescription>
          A list of all recently submitted student applications waiting for your approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
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
      </CardContent>
    </Card>
  );
}
