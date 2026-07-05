"use client";

import { useRouter } from "next/navigation";
import React, { useState, useRef, useEffect, type FormEvent } from "react";

type ThesisOption = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  examinerAssignments: Array<{
    id: string;
    examinerId: string;
    examiner: {
      user: {
        displayName: string;
        email: string;
      };
    };
  }>;
};

type ExaminerOption = {
  id: string;
  displayName: string;
  email: string;
  examinerId: string | null;
};

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

export function ExaminerAssignmentPanel({
  theses,
  examiners,
}: {
  theses: ThesisOption[];
  examiners: ExaminerOption[];
}) {
  const router = useRouter();
  const [selectedThesisId, setSelectedThesisId] = useState(theses[0]?.id ?? "");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitJson(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Action failed.");
    }

    return payload;
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/assignments/examiners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          thesisId: selectedThesisId,
          examinerId: selectedExaminerId,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to assign examiner.");
      }

      setMessage("Examiner assigned to thesis.");
      setSelectedExaminerId("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to assign examiner.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartExamination(thesisId: string) {
    setMessage(null);
    setError(null);

    try {
      await submitJson(`/api/theses/${thesisId}/status`, {
        status: "UNDER_EXAMINATION",
      });
      setMessage("Thesis moved to under examination.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update thesis status.",
      );
    }
  }

  const thesisOptions = theses.map((t) => t.id);
  const thesisLabels = theses.reduce(
    (acc, t) => {
      acc[t.id] = `${t.title} - ${t.student.user.displayName}`;
      return acc;
    },
    {} as Record<string, string>,
  );

  const activeExaminers = examiners.filter((e) => e.examinerId);
  const examinerOptions = activeExaminers.map((e) => e.examinerId as string);
  const examinerLabels = activeExaminers.reduce(
    (acc, e) => {
      acc[e.examinerId as string] = `${e.displayName} (${e.email})`;
      return acc;
    },
    {} as Record<string, string>,
  );

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Examiner Assignments</h2>
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {message}
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              New assignment
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Assignment Control</CardTitle>
            <CardDescription>
              Link an active examiner profile to a submitted thesis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAssign} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Target Thesis
                </label>
                <Select value={selectedThesisId} onValueChange={setSelectedThesisId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a thesis..." />
                  </SelectTrigger>
                  <SelectContent>
                    {thesisOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {thesisLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Examiner
                </label>
                <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an examiner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {examinerOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {examinerLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedThesisId || !selectedExaminerId}
                  className="w-full"
                >
                  {isSubmitting ? "Assigning..." : "Add Assignment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Active Examination Queue
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-4">
            {theses.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No submitted or examination-stage theses available.
                </CardContent>
              </Card>
            ) : (
              theses.map((thesis) => (
                <Card key={thesis.id}>
                  <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <Badge variant="secondary" className="uppercase mb-2">
                          {thesis.status.replaceAll("_", " ")}
                        </Badge>
                        <CardTitle className="text-xl">{thesis.title}</CardTitle>
                        <CardDescription>
                          {thesis.student.user.displayName} • {thesis.student.user.email}
                        </CardDescription>
                      </div>

                      {thesis.status === "SUBMITTED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleStartExamination(thesis.id)}
                        >
                          Start examination
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 border-t pt-4">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Examiners
                      </h4>
                      {thesis.examinerAssignments.length === 0 ? (
                        <p className="text-sm italic text-muted-foreground">
                          No examiners assigned.
                        </p>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {thesis.examinerAssignments.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="rounded-md border p-4 space-y-1"
                            >
                              <div className="text-sm font-medium leading-none">
                                {assignment.examiner.user.displayName}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {assignment.examiner.user.email}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

