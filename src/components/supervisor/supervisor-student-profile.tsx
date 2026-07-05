"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, FileText } from "lucide-react";

type StudentProfilePayload = {
  id: string;
  userId: string;
  programType: string;
  academicStatus: string;
  enrollmentDate: string | Date;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  supervisors: Array<{
    userId: string;
    displayName: string;
    email: string;
  }>;
};

function formatDateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function SupervisorStudentProfile({
  studentId,
}: {
  studentId: string;
}) {
  const [student, setStudent] = useState<StudentProfilePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/students/${studentId}`, {
          cache: "no-store",
        });
        
        const responseText = await response.text();
        let payload: { error?: string; student?: StudentProfilePayload } = {};

        try {
          payload = JSON.parse(responseText);
        } catch (e) {
          console.error("Failed to parse student profile response:", responseText);
          throw new Error(`Invalid response from server (${response.status}). Please check console logs.`);
        }

        if (!response.ok || !payload.student) {
          throw new Error(payload.error ?? "Unable to load the student profile.");
        }

        if (isMounted) {
          setStudent(payload.student);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the student profile.",
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
  }, [studentId]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="text-muted-foreground text-sm">Loading student profile...</div>
      </div>
    );
  }

  if (errorMessage || !student) {
    return (
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {errorMessage ?? "Student profile could not be loaded."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div className="space-y-1">
          <Link
            href="/dashboard/supervisor/students"
            className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Roster
          </Link>
          <h2 className="text-3xl font-bold tracking-tight">{student.user.displayName}</h2>
          <p className="text-muted-foreground">
            {student.user.email} · {student.programType} Researcher
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Programme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student.programType}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Academic Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student.academicStatus}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Enrolled Since
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDateLabel(student.enrollmentDate)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Research Proposals
            </CardTitle>
            <CardDescription>
              Review proposal submissions, evaluations, and approval history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="#">View Proposal History</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Progress Reports
            </CardTitle>
            <CardDescription>
              Review submitted reports, sign-off status, and panel feedback.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="#">Open Progress Reports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
