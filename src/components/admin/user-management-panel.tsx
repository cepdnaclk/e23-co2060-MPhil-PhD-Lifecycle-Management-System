"use client";

import { useEffect, useMemo, useState } from "react";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import {
  optionalSanitizedString,
  sanitizedEmail,
  sanitizedString,
} from "@/lib/validation/schemas";
import { z } from "zod";

const adminManagedRoles = [
  "STUDENT",
  "SUPERVISOR",
  "EXAMINER",
  "ADMINISTRATOR",
] as const;

type AdminManagedRole = (typeof adminManagedRoles)[number];

type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string;
  role: AdminManagedRole;
  isActive: boolean;
  firebaseUid: string | null;
  createdAt: string;
  department: string | null;
  specialization: string | null;
  programType?: string | null;
};

const createUserSchema = z.object({
  email: sanitizedEmail,
  displayName: sanitizedString.min(1, "Display name is required."),
  role: z.enum(adminManagedRoles),
  department: optionalSanitizedString,
  specialization: optionalSanitizedString,
  programType: optionalSanitizedString,
});

async function getAuthorizationHeader() {
  const currentUser = getFirebaseClientAuth().currentUser;

  if (!currentUser) {
    throw new Error("You must be signed in to manage users.");
  }

  const token = await currentUser.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
  };
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<"ALL" | AdminManagedRole>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    email: "",
    displayName: "",
    role: "STUDENT" as AdminManagedRole,
    department: "",
    specialization: "",
    programType: "MPHIL",
  });

  async function loadUsers(roleFilter: "ALL" | AdminManagedRole) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const headers = await getAuthorizationHeader();
      const query =
        roleFilter === "ALL" ? "" : `?role=${encodeURIComponent(roleFilter)}`;
      const response = await fetch(`/api/admin/users${query}`, {
        headers,
      });
      const payload = (await response.json()) as {
        users?: AdminUserListItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load users.");
      }

      setUsers(payload.users ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load users.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers(selectedRole);
  }, [selectedRole]);

  const visibleRoleHint = useMemo(() => {
    return selectedRole === "ALL"
      ? "Showing all administrator-managed accounts."
      : `Showing ${selectedRole.toLowerCase()} accounts only.`;
  }, [selectedRole]);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const parsed = createUserSchema.safeParse(formValues);

    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? "Invalid form values.");
      return;
    }

    setIsSubmitting(true);

    try {
      const headers = await getAuthorizationHeader();
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create the user.");
      }

      setSuccessMessage("User account created. A welcome email has been queued.");
      setIsModalOpen(false);
      setFormValues({
        email: "",
        displayName: "",
        role: "STUDENT",
        department: "",
        specialization: "",
        programType: "MPHIL",
      });
      await loadUsers(selectedRole);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create the user.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeactivate(userId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const headers = await getAuthorizationHeader();
      const response = await fetch(`/api/admin/users/${userId}/deactivate`, {
        method: "PATCH",
        headers,
      });
      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to deactivate the user.");
      }

      setSuccessMessage("User account deactivated.");
      await loadUsers(selectedRole);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to deactivate the user.",
      );
    }
  }

  return (
    <div className="space-y-12">
      <header className="pb-10 border-b-2 border-gray-200">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Administration
            </p>
            <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              User Accounts
            </h2>
            <p className="max-w-2xl text-xl leading-relaxed text-black/80 font-medium">
              Manage system access for students, supervisors, examiners, and staff.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <select
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(event.target.value as "ALL" | AdminManagedRole)
              }
              className="rounded-[0.75em] border-2 border-black bg-transparent px-4 py-3 text-base font-bold text-black outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="STUDENT">Students</option>
              <option value="SUPERVISOR">Supervisors</option>
              <option value="EXAMINER">Examiners</option>
              <option value="ADMINISTRATOR">Administrators</option>
            </select>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="group inline-block text-base font-bold bg-black rounded-[0.75em] cursor-pointer"
            >
              <span className="block box-border border-2 border-black rounded-[0.75em] px-[1.5em] py-[0.75em] bg-black text-white -translate-y-[0.2em] transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                Create New User
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-4">
        <p className="text-sm font-black uppercase tracking-widest text-black/40">
          {visibleRoleHint}
        </p>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
          {successMessage}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-[24px] border border-gray-200 bg-transparent md:block">
        <table className="min-w-full divide-y divide-gray-300 text-base">
          <thead className="text-left text-black">
            <tr>
              <th className="px-6 py-5 font-black uppercase tracking-widest text-[14px] text-black/40">User</th>
              <th className="px-6 py-5 font-black uppercase tracking-widest text-[14px] text-black/40">Role</th>
              <th className="px-6 py-5 font-black uppercase tracking-widest text-[14px] text-black/40">Context</th>
              <th className="px-6 py-5 font-black uppercase tracking-widest text-[14px] text-black/40">Status</th>
              <th className="px-6 py-5 font-black uppercase tracking-widest text-[14px] text-black/40">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300 text-black">
            {isLoading ? (
              <tr>
                <td className="px-6 py-12 text-center font-bold text-black/40" colSpan={5}>
                  Loading user records...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td className="px-6 py-12 text-center font-bold text-black/40" colSpan={5}>
                  No matching user accounts found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="align-top hover:bg-black/5 transition-colors">
                  <td className="px-6 py-6">
                    <div className="font-black text-lg">{user.displayName}</div>
                    <div className="text-black/60 font-medium">{user.email}</div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="inline-block px-3 py-1 border-2 border-black rounded-lg text-[13px] font-black uppercase tracking-wider">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-6 font-black">
                    {user.role === "STUDENT" ? (
                      <div className="text-lg">{user.programType ?? "N/A"} Candidate</div>
                    ) : (
                      <>
                        <div className="text-lg">{user.department ?? "No Department"}</div>
                        {user.specialization ? (
                          <div className="text-sm text-black/70">{user.specialization}</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-6">
                    <span
                      className={`inline-block rounded-full border-2 px-3 py-1 text-[13px] font-black uppercase tracking-widest ${
                        user.isActive
                          ? "border-black text-black"
                          : "border-gray-300 text-gray-300"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-6">
                    <button
                      type="button"
                      disabled={!user.isActive}
                      onClick={() => void handleDeactivate(user.id)}
                      className="rounded-xl border-2 border-black px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition hover:bg-black hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {users.map((user) => (
          <article
            key={user.id}
            className="rounded-[24px] border border-gray-200 bg-transparent p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-black text-black tracking-tight">
                  {user.displayName}
                </p>
                <p className="text-sm font-medium text-black/60">
                  {user.email}
                </p>
              </div>
              <span className="shrink-0 rounded-lg border-2 border-black px-2 py-1 text-[12px] font-black uppercase">
                {user.role}
              </span>
            </div>
            <button
              type="button"
              disabled={!user.isActive}
              onClick={() => void handleDeactivate(user.id)}
              className="mt-6 w-full rounded-xl border-2 border-black py-3 text-xs font-black uppercase tracking-widest transition hover:bg-black hover:text-white disabled:opacity-20"
            >
              Deactivate Account
            </button>
          </article>
        ))}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-xl rounded-[30px] border-4 border-black bg-white p-8 shadow-[15px_15px_0px_black]">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-4xl font-black tracking-tighter text-black">Create User</h2>
                <p className="mt-2 text-lg font-medium text-black/60">
                  Provision a new system account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full border-2 border-black p-2 hover:bg-black hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form className="space-y-6" onSubmit={handleCreateUser}>
              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-black/40 ml-1">Email Address</span>
                  <input
                    value={formValues.email}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-black font-bold outline-none focus:bg-gray-50"
                    placeholder="name@pdn.ac.lk"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-black/40 ml-1">Full Name</span>
                  <input
                    value={formValues.displayName}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-black font-bold outline-none focus:bg-gray-50"
                    placeholder="Enter name"
                  />
                </label>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-black/40 ml-1">System Role</span>
                  <select
                    value={formValues.role}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        role: event.target.value as AdminManagedRole,
                      }))
                    }
                    className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-black font-bold outline-none"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="EXAMINER">Examiner</option>
                    <option value="ADMINISTRATOR">Administrator</option>
                  </select>
                </label>

                {formValues.role === "STUDENT" ? (
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-widest text-black/40 ml-1">Program</span>
                    <select
                      value={formValues.programType}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          programType: event.target.value,
                        }))
                      }
                      className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-black font-bold outline-none"
                    >
                      <option value="MPHIL">MPhil</option>
                      <option value="PHD">PhD</option>
                      <option value="MSC">MSc</option>
                      <option value="MENG">MEng</option>
                    </select>
                  </label>
                ) : (
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-widest text-black/40 ml-1">Department</span>
                    <input
                      value={formValues.department}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          department: event.target.value,
                        }))
                      }
                      className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 text-black font-bold outline-none"
                      placeholder="e.g. Computer Engineering"
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-4 text-base font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group inline-block text-base font-bold bg-black rounded-[0.75em] cursor-pointer"
                >
                  <span className="block box-border border-2 border-black rounded-[0.75em] px-8 py-4 bg-black text-white -translate-y-[0.2em] transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
                    {isSubmitting ? "Creating..." : "Confirm Creation"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
