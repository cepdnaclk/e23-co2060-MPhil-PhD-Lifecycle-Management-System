"use client";

import Link from "next/link";
import { ProgramType, RegistrationStatus } from "@prisma/client";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";

type SupervisorStudentListItem = {
  assignmentId: string;
  assignedAt: string | Date;
  isPrimary: boolean;
  student: {
    id: string;
    userId: string;
    displayName: string;
    email: string;
    programType: ProgramType;
    academicStatus: string;
  };
  currentRegistration: {
    id: string;
    status: RegistrationStatus;
    startDate: string | Date;
    expirationDate: string | Date;
  } | null;
  latestProposal: {
    id: string;
    title: string;
    status: string;
    updatedAt: string | Date;
  } | null;
};

const EMPTY_STUDENTS: SupervisorStudentListItem[] = [];

function formatDateLabel(value: string | Date | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getRegistrationLabel(
  registration: SupervisorStudentListItem["currentRegistration"],
) {
  return registration?.status ?? "UNKNOWN";
}

function getProposalLabel(proposal: SupervisorStudentListItem["latestProposal"]) {
  return proposal?.status ?? "NO_PROPOSAL";
}

export function SupervisorStudentsPanel({
  initialStudents = EMPTY_STUDENTS,
}: {
  initialStudents?: SupervisorStudentListItem[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [programFilter, setProgramFilter] = useState<"ALL" | "MPHIL" | "PHD">(
    "ALL",
  );
  const [registrationFilter, setRegistrationFilter] = useState<
    "ALL" | "ACTIVE" | "LAPSED"
  >("ALL");
  const [isLoading, setIsLoading] = useState(initialStudents.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialStudents.length > 0) {
      return;
    }

    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const response = await fetch("/api/supervisor/students", {
          cache: "no-store",
        });
        
        const responseText = await response.text();
        let payload: { error?: string; students?: SupervisorStudentListItem[] } = {};
        
        try {
          payload = JSON.parse(responseText);
        } catch (e) {
          console.error("Failed to parse supervisor students response:", responseText);
          throw new Error(`Invalid response from server (${response.status}). Please check console logs.`);
        }

        if (!response.ok || !payload.students) {
          throw new Error(payload.error ?? "Unable to load assigned students.");
        }

        if (isMounted) {
          setStudents(payload.students);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load assigned students.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialStudents.length]);

  const filteredStudents = students.filter((entry) => {
    const registrationLabel = getRegistrationLabel(entry.currentRegistration);

    if (programFilter !== "ALL" && entry.student.programType !== programFilter) {
      return false;
    }

    if (registrationFilter !== "ALL" && registrationLabel !== registrationFilter) {
      return false;
    }

    return true;
  });

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Student Roster</h2>
          <p className="text-muted-foreground mt-2">
            Review assigned students, registrations, and latest proposals.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-2">
          <Label>Program Type</Label>
          <Select
            value={programFilter}
            onValueChange={(val: any) => setProgramFilter(val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All programmes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All programmes</SelectItem>
              <SelectItem value="MPHIL">MPhil</SelectItem>
              <SelectItem value="PHD">PhD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Registration Status</Label>
          <Select
            value={registrationFilter}
            onValueChange={(val: any) => setRegistrationFilter(val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All registrations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All registrations</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="LAPSED">Lapsed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="flex flex-col justify-center px-6 py-2 min-w-[150px]">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filtered results
          </p>
          <p className="mt-1 text-3xl font-bold">
            {filteredStudents.length}
          </p>
        </Card>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Researcher</TableHead>
                <TableHead>Status & Proposal</TableHead>
                <TableHead className="text-right px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    Loading assigned students...
                  </TableCell>
                </TableRow>
              ) : filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No matches found. Adjust your filters and try again.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((entry) => {
                  const registrationLabel = getRegistrationLabel(entry.currentRegistration);
                  const proposalLabel = getProposalLabel(entry.latestProposal);

                  return (
                    <TableRow key={entry.assignmentId}>
                      <TableCell className="px-6">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/dashboard/supervisor/students/${entry.student.id}`}
                            className="font-bold hover:underline"
                          >
                            {entry.student.displayName}
                          </Link>
                          <span className="text-sm text-muted-foreground">{entry.student.email}</span>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="secondary" className="uppercase">
                              {entry.student.programType}
                            </Badge>
                            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                              {entry.isPrimary ? "Primary" : "Co-supervisor"} · {formatDateLabel(entry.assignedAt)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Registration</span>
                            <span
                              className="text-sm font-medium"
                              data-testid={`registration-badge-${entry.student.id}`}
                            >
                              {registrationLabel} · Expires {formatDateLabel(entry.currentRegistration?.expirationDate)}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Latest Proposal</span>
                            <span className="max-w-[200px] truncate text-sm font-medium">
                              {entry.latestProposal ? entry.latestProposal.title : "No proposal submitted"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/supervisor/students/${entry.student.id}`}>
                            Open Profile
                            <span className="sr-only">{entry.student.displayName}</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
