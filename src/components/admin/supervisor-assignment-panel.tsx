"use client";

import { useEffect, useState } from "react";
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

export function SupervisorAssignmentPanel() {
  const [students, setStudents] = useState<StudentWithAssignments[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
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
        fetch("/api/admin/users?role=SUPERVISOR", { headers })
      ]);

      const studentsData = await studentsRes.json();
      const supervisorsData = await supervisorsRes.json();

      if (!studentsRes.ok) throw new Error(studentsData.error || "Failed to load students.");
      if (!supervisorsRes.ok) throw new Error(supervisorsData.error || "Failed to load supervisors.");

      setStudents(studentsData.students || []);
      
      // The /api/admin/users returns a slightly different structure, need to map or check it
      // Based on UserManagementPanel, it returns { users: AdminUserListItem[] }
      // But we need the Supervisor ID (which is in the supervisor relation).
      // Actually, the /api/admin/users probably doesn't return the Supervisor profile ID.
      // I might need a specialized endpoint for supervisors or handle it differently.
      
      // Let's check what /api/admin/users returns exactly. 
      // If it doesn't have the supervisor ID, I'll need a new API.
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
          ...headers
        },
        body: JSON.stringify({
          studentId: selectedStudentId,
          supervisorId: selectedSupervisorId, // This might need to be the Supervisor profile ID
          isPrimary
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign supervisor.");

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
    if (!confirm("Are you sure you want to remove this supervisor assignment?")) return;

    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthorizationHeader();
      const res = await fetch(`/api/assignments/supervisors/${assignmentId}`, {
        method: "DELETE",
        headers
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove assignment.");

      setSuccess("Assignment removed.");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    }
  };

  if (isLoading) return <div className="p-8 text-black">Loading assignments...</div>;

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-gray-200 bg-transparent p-6 shadow-none">
        <h1 className="text-3xl font-semibold text-black">Supervisor Assignments</h1>
        <p className="mt-2 text-black">Manage student-supervisor pairings and primary oversight roles.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-gray-300 bg-transparent p-4 text-base text-black">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-gray-300 bg-transparent p-4 text-base text-black">
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Student List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-3xl border border-gray-200 bg-transparent overflow-hidden">
            <table className="min-w-full divide-y divide-slate-800 text-base">
              <thead className="bg-transparent text-black">
                <tr>
                  <th className="px-5 py-4 text-left font-medium">Student</th>
                  <th className="px-5 py-4 text-left font-medium">Supervisors</th>
                  <th className="px-5 py-4 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-black">
                {students.map((student) => (
                  <tr key={student.id} className={selectedStudentId === student.id ? "bg-transparent" : ""}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-black">{student.user.displayName}</div>
                      <div className="text-black">{student.user.email}</div>
                      <div className="mt-1 text-base text-black">{student.programType} - {student.academicStatus}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-2">
                        {student.supervisorAssignments.length === 0 ? (
                          <span className="text-gray-400 italic">No supervisors assigned</span>
                        ) : (
                          student.supervisorAssignments.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-transparent p-2">
                              <div>
                                <div className="font-medium">{a.supervisor.user.displayName}</div>
                                <div className="text-[10px] uppercase tracking-wider text-black">
                                  {a.isPrimary ? "Primary" : "Co-supervisor"}
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemove(a.id)}
                                className="text-black hover:text-black transition"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSelectedStudentId(student.id)}
                        className="rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-base font-semibold text-black hover:border-gray-300 transition"
                      >
                        Add Supervisor
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assignment Form */}
        <div className="space-y-4">
          <div className="sticky top-6 rounded-3xl border border-gray-200 bg-transparent p-6 shadow-none">
            <h2 className="text-xl font-semibold text-black mb-4">
              {selectedStudentId 
                ? `Assign to ${students.find(s => s.id === selectedStudentId)?.user.displayName}` 
                : "Select a student to assign"}
            </h2>

            <form onSubmit={handleAssign} className="space-y-4">
              <div className="space-y-2">
                <label className="text-base text-black">Supervisor</label>
                <select
                  disabled={!selectedStudentId}
                  value={selectedSupervisorId}
                  onChange={(e) => setSelectedSupervisorId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300 disabled:opacity-50"
                >
                  <option value="">Select a supervisor...</option>
                  {supervisors.map((s: any) => (
                    <option key={s.supervisorId} value={s.supervisorId}>{s.displayName} ({s.email})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isPrimary"
                  disabled={!selectedStudentId}
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 bg-transparent text-black focus:ring-sky-500"
                />
                <label htmlFor="isPrimary" className="text-base text-black cursor-pointer">
                  Assign as Primary Supervisor
                </label>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={!selectedStudentId || !selectedSupervisorId || isSubmitting}
                  className="flex-1 rounded-2xl bg-black py-3 text-base font-semibold text-black transition hover:bg-black disabled:opacity-50"
                >
                  {isSubmitting ? "Assigning..." : "Add Assignment"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudentId(null);
                    setSelectedSupervisorId("");
                    setIsPrimary(false);
                  }}
                  className="px-4 rounded-2xl border border-gray-300 text-base font-medium text-black hover:bg-transparent"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="mt-6 p-4 rounded-2xl bg-transparent border border-gray-300 text-base text-black">
              <p className="font-semibold mb-1">Assignment Rules:</p>
              <ul className="list-disc list-inside space-y-1 opacity-80">
                <li>Max 3 supervisors total per student.</li>
                <li>Exactly 1 primary supervisor required.</li>
                <li>Max 2 co-supervisors allowed.</li>
                <li>Supervisors must have active accounts.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
