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

interface CustomSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  labelMap: Record<T, string>;
  className?: string;
  fullWidth?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function CustomSelect<T extends string>({
  value,
  onChange,
  options,
  labelMap,
  className = "",
  fullWidth = false,
  placeholder = "Select an option...",
  disabled = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className={`relative ${fullWidth ? "w-full" : ""} ${className}`}
      ref={containerRef}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border-2 border-black bg-white px-6 py-3 text-base font-black text-black outline-none transition-all hover:bg-gray-50 focus:ring-4 focus:ring-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {value ? labelMap[value] : placeholder}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-[110] mt-2 overflow-hidden rounded-2xl border-2 border-black bg-white">
          <ul className="max-h-60 overflow-y-auto py-1">
            {options.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full px-6 py-3 text-left text-base font-bold transition-colors hover:bg-black hover:text-white ${
                    value === option ? "bg-black/5" : ""
                  }`}
                >
                  {labelMap[option]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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
    <div className="space-y-12">
      <header className="border-b-2 border-gray-200 pb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Administration
            </p>
            <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              Supervisor Assignments
            </h2>
            <p className="max-w-2xl font-medium text-xl leading-relaxed text-black/80">
              Manage student-supervisor pairings and primary oversight roles for
              the postgraduate journey.
            </p>
          </div>
        </div>
      </header>

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
        {/* Student List */}
        <div className="space-y-6 lg:col-span-2">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              Student Records & Assignments
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="overflow-hidden rounded-[24px] border border-gray-300 bg-white">
            <table className="min-w-full divide-y divide-gray-300 text-base">
              <thead className="text-left text-black">
                <tr>
                  <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                    Student
                  </th>
                  <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                    Current Supervisors
                  </th>
                  <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300 text-black">
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className={`align-top transition-colors ${selectedStudentId === student.id ? "bg-black/5" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-6 py-6">
                      <div className="text-lg font-black">
                        {student.user.displayName}
                      </div>
                      <div className="font-medium text-black/60">
                        {student.user.email}
                      </div>
                      <div className="mt-2 inline-block rounded-lg border-2 border-black px-2 py-0.5 text-[11px] font-black uppercase tracking-wider">
                        {student.programType} • {student.academicStatus}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="space-y-3">
                        {student.supervisorAssignments.length === 0 ? (
                          <span className="text-sm font-bold text-black/30 italic">
                            No assignments
                          </span>
                        ) : (
                          student.supervisorAssignments.map((a) => (
                            <div
                              key={a.id}
                              className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-2 ${a.isPrimary ? "border-black bg-black text-white" : "border-gray-200 bg-white"}`}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black">
                                  {a.supervisor.user.displayName}
                                </div>
                                <div
                                  className={`text-[10px] font-black uppercase tracking-widest ${a.isPrimary ? "text-white/60" : "text-black/40"}`}
                                >
                                  {a.isPrimary ? "Primary" : "Co-Supervisor"}
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemove(a.id)}
                                className={`shrink-0 rounded-lg p-1 transition-colors ${a.isPrimary ? "hover:bg-white/20" : "hover:bg-red-50 hover:text-red-600"}`}
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="3"
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <button
                        onClick={() => setSelectedStudentId(student.id)}
                        className={`rounded-xl border-2 px-4 py-2 text-xs font-black uppercase tracking-widest transition ${selectedStudentId === student.id ? "bg-black text-white border-black" : "border-black text-black hover:bg-black hover:text-white"}`}
                      >
                        {selectedStudentId === student.id ? "Selected" : "Assign"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assignment Form */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="text-sm font-black uppercase tracking-widest text-black/40">
              New Assignment
            </p>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="sticky top-10 rounded-[24px] border border-gray-300 bg-white p-8">
            <h2 className="text-3xl font-black tracking-tighter text-black">
              {selectedStudent
                ? `Assign to ${selectedStudent.user.displayName}`
                : "Select a student"}
            </h2>
            <p className="mt-2 text-base font-medium text-black/60">
              {selectedStudent
                ? `Linking a supervisor to this researcher's profile.`
                : "Click 'Assign' in the table to start."}
            </p>

            <form onSubmit={handleAssign} className="mt-8 space-y-6">
              <div className="space-y-2">
                <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                  Select Supervisor
                </span>
                <CustomSelect
                  disabled={!selectedStudentId}
                  value={selectedSupervisorId}
                  onChange={setSelectedSupervisorId}
                  options={supervisorOptions}
                  labelMap={supervisorLabels}
                  placeholder="Choose a supervisor..."
                  fullWidth
                />
              </div>

              <div className="flex items-center gap-4 rounded-2xl border-2 border-black bg-gray-50 px-5 py-4">
                <input
                  type="checkbox"
                  id="isPrimary"
                  disabled={!selectedStudentId}
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="h-6 w-6 cursor-pointer rounded border-2 border-black accent-black focus:ring-0"
                />
                <label
                  htmlFor="isPrimary"
                  className="cursor-pointer text-sm font-black uppercase tracking-wider text-black"
                >
                  Set as Primary Supervisor
                </label>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="submit"
                  disabled={
                    !selectedStudentId ||
                    !selectedSupervisorId ||
                    isSubmitting
                  }
                  className="group inline-block cursor-pointer rounded-[0.75em] bg-black text-base font-bold disabled:opacity-50"
                >
                  <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black box-border px-8 py-4 text-center text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                    {isSubmitting ? "Assigning..." : "Confirm Assignment"}
                  </span>
                </button>
                {selectedStudentId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(null);
                      setSelectedSupervisorId("");
                      setIsPrimary(false);
                    }}
                    className="px-6 py-2 text-sm font-black uppercase tracking-widest text-black/40 transition-colors hover:text-black"
                  >
                    Cancel Selection
                  </button>
                )}
              </div>
            </form>

            <div className="mt-10 rounded-[24px] border border-dashed border-gray-300 bg-white p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-black/40 mb-3">
                Supervision Rules
              </p>
              <ul className="space-y-2 text-xs font-bold text-black/60">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
                  Exactly 1 Primary Supervisor
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
                  Maximum 3 supervisors total
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
                  Only active staff allowed
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

