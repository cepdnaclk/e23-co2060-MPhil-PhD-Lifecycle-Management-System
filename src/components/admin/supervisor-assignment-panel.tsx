"use client";

import React, { useEffect, useState, useRef } from "react";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

type Supervisor = {
  id: string;
  supervisorId: string;
  displayName: string;
  email: string;
};

type Assignment = {
  id: string;
  isPrimary: boolean;
  assignedAt: string;
  supervisor: {
    id: string;
    user: {
      displayName: string;
      email: string;
    };
  };
};

type StudentWithAssignments = {
  id: string;
  programType: string;
  academicStatus: string;
  user: {
    displayName: string;
    email: string;
  };
  supervisorAssignments: Assignment[];
};

async function getAuthorizationHeader() {
  const currentUser = getFirebaseClientAuth().currentUser;
  if (!currentUser) throw new Error("You must be signed in.");
  const token = await currentUser.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

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
import { Trash2 } from "lucide-react";

export function SupervisorAssignmentPanel() {
  const [students, setStudents] = useState<StudentWithAssignments[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = await getAuthorizationHeader();

      const [studentsRes, supervisorsRes] = await Promise.all([
        fetch("/api/assignments/supervisors", { headers }),
        fetch("/api/admin/users?role=SUPERVISOR", { headers }),
      ]);

      const studentsData = await studentsRes.json();
      const supervisorsData = await supervisorsRes.json();

      if (!studentsRes.ok)
        throw new Error(studentsData.error || "Failed to load students.");
      if (!supervisorsRes.ok)
        throw new Error(supervisorsData.error || "Failed to load supervisors.");

      setStudents(studentsData.students || []);
      setSupervisors(supervisorsData.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedSupervisorId) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthorizationHeader();
      const res = await fetch("/api/assignments/supervisors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          studentId: selectedStudentId,
          supervisorId: selectedSupervisorId,
          isPrimary,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to assign supervisor.");

      setSuccess("Supervisor assigned successfully.");
      setSelectedSupervisorId("");
      setIsPrimary(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    if (
      !confirm("Are you sure you want to remove this supervisor assignment?")
    )
      return;

    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthorizationHeader();
      const res = await fetch(`/api/assignments/supervisors/${assignmentId}`, {
        method: "DELETE",
        headers,
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to remove assignment.");

      setSuccess("Assignment removed.");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    }
  };

  const supervisorOptions = supervisors.map((s) => s.supervisorId);
  const supervisorLabels: Record<string, string> = supervisors.reduce(
    (acc, s) => {
      acc[s.supervisorId] = `${s.displayName} (${s.email})`;
      return acc;
    },
    {} as Record<string, string>,
  );

  if (isLoading)
    return <div className="p-12 text-center font-black uppercase tracking-[0.3em] text-black/40">Loading assignments...</div>;

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Supervisor Assignments</h2>
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {success}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Students</CardTitle>
              <CardDescription>Select a student to assign a supervisor.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Current Supervisors</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow
                      key={student.id}
                      className={selectedStudentId === student.id ? "bg-muted/50" : ""}
                    >
                      <TableCell className="align-top">
                        <div className="font-medium">{student.user.displayName}</div>
                        <div className="text-sm text-muted-foreground">{student.user.email}</div>
                        <div className="mt-2 text-xs text-muted-foreground uppercase">
                          {student.programType} • {student.academicStatus}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-2">
                          {student.supervisorAssignments.length === 0 ? (
                            <span className="text-sm italic text-muted-foreground">No assignments</span>
                          ) : (
                            student.supervisorAssignments.map((a) => (
                              <div
                                key={a.id}
                                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${a.isPrimary ? "bg-primary text-primary-foreground" : "bg-background"}`}
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{a.supervisor.user.displayName}</div>
                                  <div className="text-[10px] uppercase tracking-wider opacity-80">
                                    {a.isPrimary ? "Primary" : "Co-Supervisor"}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={`h-8 w-8 ${a.isPrimary ? "hover:bg-primary-foreground/20 text-primary-foreground" : "hover:text-destructive hover:bg-destructive/10"}`}
                                  onClick={() => handleRemove(a.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Button
                          variant={selectedStudentId === student.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          {selectedStudentId === student.id ? "Selected" : "Assign"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Assignment Form */}
        <div className="space-y-6">
          <Card className="sticky top-10">
            <CardHeader>
              <CardTitle>
                {selectedStudent
                  ? `Assign to ${selectedStudent.user.displayName}`
                  : "New Assignment"}
              </CardTitle>
              <CardDescription>
                {selectedStudent
                  ? `Linking a supervisor to this researcher's profile.`
                  : "Click 'Assign' in the table to start."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAssign} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Select Supervisor</label>
                  <Select
                    disabled={!selectedStudentId}
                    value={selectedSupervisorId}
                    onValueChange={setSelectedSupervisorId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a supervisor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {supervisorOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {supervisorLabels[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2 rounded-md border p-4">
                  <input
                    type="checkbox"
                    id="isPrimary"
                    disabled={!selectedStudentId}
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label
                    htmlFor="isPrimary"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Set as Primary Supervisor
                  </label>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={!selectedStudentId || !selectedSupervisorId || isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? "Assigning..." : "Confirm Assignment"}
                  </Button>
                  {selectedStudentId && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSelectedStudentId(null);
                        setSelectedSupervisorId("");
                        setIsPrimary(false);
                      }}
                      className="w-full"
                    >
                      Cancel Selection
                    </Button>
                  )}
                </div>
              </form>

              <div className="mt-8 rounded-md bg-muted p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Supervision Rules
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
                  <li>Exactly 1 Primary Supervisor</li>
                  <li>Maximum 3 supervisors total</li>
                  <li>Only active staff allowed</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

