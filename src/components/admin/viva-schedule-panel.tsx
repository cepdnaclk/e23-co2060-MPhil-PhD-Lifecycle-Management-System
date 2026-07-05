"use client";

import { useRouter } from "next/navigation";
import React, { useState, useRef, useEffect, type FormEvent } from "react";

import { scheduleVivaSchema } from "@/lib/vivas/schemas";

type ThesisForViva = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  viva: {
    id: string;
    scheduledDate: string | Date;
    venue: string;
    outcome: string | null;
  } | null;
  examinerAssignments: Array<{
    id: string;
    examiner: {
      user: {
        displayName: string;
      };
    };
  }>;
};

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, MapPin } from "lucide-react";

export function VivaSchedulePanel({ theses }: { theses: ThesisForViva[] }) {
  const router = useRouter();
  const [thesisId, setThesisId] = useState(theses[0]?.id ?? "");
  const [venue, setVenue] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const parsedSchedule = scheduleVivaSchema.safeParse({
      thesisId,
      venue,
      scheduledDate,
    });

    if (!parsedSchedule.success) {
      setError(
        parsedSchedule.error.issues[0]?.message ??
          "Invalid viva scheduling details.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/vivas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          thesisId: parsedSchedule.data.thesisId,
          venue: parsedSchedule.data.venue,
          scheduledDate: parsedSchedule.data.scheduledDate.toISOString(),
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to schedule viva.");
      }

      setMessage("Viva scheduled successfully.");
      setVenue("");
      setScheduledDate("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to schedule viva.",
      );
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Schedule Vivas</h2>
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

      <div className="grid gap-10 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Viva Details</CardTitle>
              <CardDescription>
                Enter logistics for the upcoming oral examination.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    Target Thesis
                  </label>
                  <Select value={thesisId} onValueChange={setThesisId}>
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
                  <label className="text-sm font-medium leading-none">
                    Venue
                  </label>
                  <Input
                    value={venue}
                    onChange={(event) => setVenue(event.target.value)}
                    placeholder="e.g. Boardroom 1 / Zoom Link"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    Date and Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(event) => setScheduledDate(event.target.value)}
                    required
                  />
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !thesisId}
                    className="w-full"
                  >
                    {isSubmitting ? "Scheduling..." : "Schedule Viva"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              Upcoming Vivas
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="space-y-4">
            {theses.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No theses are currently under examination.
                </CardContent>
              </Card>
            ) : (
              theses.map((thesis) => (
                <Card key={thesis.id}>
                  <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-xl">{thesis.title}</CardTitle>
                        <CardDescription>
                          {thesis.student.user.displayName} • {thesis.student.user.email}
                        </CardDescription>
                      </div>
                      <Badge variant={thesis.viva ? "default" : "secondary"}>
                        {thesis.viva ? "Scheduled" : "Not Scheduled"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 border-t pt-4">
                      <div className="flex flex-col gap-1 w-full sm:w-auto sm:flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Examiners
                        </p>
                        <p className="text-sm font-medium">
                          {thesis.examinerAssignments.length > 0
                            ? thesis.examinerAssignments
                                .map((assignment) => assignment.examiner.user.displayName)
                                .join(", ")
                            : "None assigned"}
                        </p>
                      </div>

                      {thesis.viva && (
                        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-4 w-full sm:w-auto sm:flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Logistics
                          </p>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium">
                              {new Date(thesis.viva.scheduledDate).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-medium">{thesis.viva.venue}</p>
                          </div>
                          {thesis.viva.outcome && (
                            <div className="mt-2 border-t pt-2 text-xs font-medium text-muted-foreground">
                              Status: {thesis.viva.outcome}
                            </div>
                          )}
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

