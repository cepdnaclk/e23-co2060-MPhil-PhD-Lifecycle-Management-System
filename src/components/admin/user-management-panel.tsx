"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { getFirebaseClientAuth } from "@/lib/firebase/client";

const adminManagedRoles = [
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
};

const createUserSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  displayName: z.string().min(1, "Display name is required."),
  role: z.enum(adminManagedRoles),
  department: z.string().optional(),
  specialization: z.string().optional(),
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
    role: "SUPERVISOR" as AdminManagedRole,
    department: "",
    specialization: "",
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
        role: "SUPERVISOR",
        department: "",
        specialization: "",
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
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/40 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">
            Administrator User Management
          </p>
          <h1 className="text-3xl font-semibold text-white">Manage staff accounts</h1>
          <p className="max-w-2xl text-sm text-slate-300">
            Create and deactivate supervisor, examiner, and administrator accounts.
            Student onboarding stays outside this flow by design.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            value={selectedRole}
            onChange={(event) =>
              setSelectedRole(event.target.value as "ALL" | AdminManagedRole)
            }
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none focus:border-sky-400"
          >
            <option value="ALL">All roles</option>
            <option value="SUPERVISOR">Supervisors</option>
            <option value="EXAMINER">Examiners</option>
            <option value="ADMINISTRATOR">Administrators</option>
          </select>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
          >
            Create New User
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-400">{visibleRoleHint}</p>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-slate-300">
            <tr>
              <th className="px-5 py-4 text-left font-medium">Name</th>
              <th className="px-5 py-4 text-left font-medium">Role</th>
              <th className="px-5 py-4 text-left font-medium">Department</th>
              <th className="px-5 py-4 text-left font-medium">Status</th>
              <th className="px-5 py-4 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {isLoading ? (
              <tr>
                <td className="px-5 py-6 text-slate-400" colSpan={5}>
                  Loading accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-slate-400" colSpan={5}>
                  No administrator-managed users found for this filter.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="px-5 py-4">
                    <div className="font-medium text-white">{user.displayName}</div>
                    <div className="text-slate-400">{user.email}</div>
                  </td>
                  <td className="px-5 py-4">{user.role}</td>
                  <td className="px-5 py-4">
                    <div>{user.department ?? "Not set"}</div>
                    {user.specialization ? (
                      <div className="text-slate-400">{user.specialization}</div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        user.isActive
                          ? "rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200"
                          : "rounded-full bg-slate-700/70 px-3 py-1 text-xs font-medium text-slate-300"
                      }
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      disabled={!user.isActive}
                      onClick={() => void handleDeactivate(user.id)}
                      className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
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

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-slate-950/60">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Create New User</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Available roles here are limited to supervisors, examiners, and
                  administrators.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300"
              >
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCreateUser}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-200">
                  <span>Email</span>
                  <input
                    value={formValues.email}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                    placeholder="name@eng.pdn.ac.lk"
                  />
                </label>

                <label className="space-y-2 text-sm text-slate-200">
                  <span>Display name</span>
                  <input
                    value={formValues.displayName}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                    placeholder="Dr. Jane Perera"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-200">
                  <span>Role</span>
                  <select
                    value={formValues.role}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        role: event.target.value as AdminManagedRole,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                  >
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="EXAMINER">Examiner</option>
                    <option value="ADMINISTRATOR">Administrator</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-200">
                  <span>Department</span>
                  <input
                    value={formValues.department}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        department: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                    placeholder="Computer Engineering"
                  />
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-200">
                <span>Specialization</span>
                <input
                  value={formValues.specialization}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      specialization: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
                  placeholder="Distributed Systems"
                />
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
