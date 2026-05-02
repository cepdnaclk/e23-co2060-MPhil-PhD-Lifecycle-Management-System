"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
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

interface CustomSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  labelMap: Record<T, string>;
  className?: string;
  fullWidth?: boolean;
}

function CustomSelect<T extends string>({
  value,
  onChange,
  options,
  labelMap,
  className = "",
  fullWidth = false,
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
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border-2 border-black bg-white px-6 py-3 text-base font-black text-black outline-none transition-all hover:bg-gray-50 focus:ring-4 focus:ring-black/5"
      >
        <span className="truncate">{labelMap[value]}</span>
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

export function UserManagementPanel() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<"ALL" | AdminManagedRole>(
    "ALL",
  );
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

  const roleFilterOptions = ["ALL", ...adminManagedRoles] as const;
  const roleLabels: Record<string, string> = {
    ALL: "All Roles",
    STUDENT: "Students",
    SUPERVISOR: "Supervisors",
    EXAMINER: "Examiners",
    ADMINISTRATOR: "Administrators",
  };

  const createRoleLabels: Record<string, string> = {
    STUDENT: "Student",
    SUPERVISOR: "Supervisor",
    EXAMINER: "Examiner",
    ADMINISTRATOR: "Administrator",
  };

  const programOptions = ["MPHIL", "PHD", "MSC", "MENG"] as const;
  const programLabels: Record<string, string> = {
    MPHIL: "MPhil",
    PHD: "PhD",
    MSC: "MSc",
    MENG: "MEng",
  };

  return (
    <div className="space-y-12">
      <header className="border-b-2 border-gray-200 pb-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <p className="text-base font-black uppercase tracking-[0.3em] text-black/40">
              Administration
            </p>
            <h2 className="text-5xl font-black tracking-tighter text-black sm:text-6xl">
              User Accounts
            </h2>
            <p className="max-w-2xl font-medium text-xl leading-relaxed text-black/80">
              Manage system access for students, supervisors, examiners, and
              staff.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <CustomSelect
              value={selectedRole}
              onChange={setSelectedRole}
              options={roleFilterOptions}
              labelMap={roleLabels}
              className="min-w-[180px]"
            />

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="group inline-block cursor-pointer rounded-[0.75em] bg-black text-base font-bold"
            >
              <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black box-border px-[1.5em] py-[0.75em] text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
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
        <div className="h-px flex-1 bg-gray-200" />
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

      <div className="hidden overflow-hidden rounded-[24px] border border-gray-300 bg-white md:block">
        <table className="min-w-full divide-y divide-gray-300 text-base">
          <thead className="text-left text-black">
            <tr>
              <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                User
              </th>
              <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                Role
              </th>
              <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                Context
              </th>
              <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                Status
              </th>
              <th className="px-6 py-5 text-[14px] font-black uppercase tracking-widest text-black/40">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300 text-black">
            {isLoading ? (
              <tr>
                <td
                  className="px-6 py-12 text-center font-bold text-black/40"
                  colSpan={5}
                >
                  Loading user records...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td
                  className="px-6 py-12 text-center font-bold text-black/40"
                  colSpan={5}
                >
                  No matching user accounts found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="group align-top transition-colors hover:bg-black"
                >
                  <td className="px-6 py-6">
                    <div className="text-lg font-black transition-colors group-hover:text-white">{user.displayName}</div>
                    <div className="font-medium text-black/60 transition-colors group-hover:text-white/80">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="inline-block rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-6 font-black">
                    {user.role === "STUDENT" ? (
                      <div className="text-lg transition-colors group-hover:text-white">
                        {user.programType ?? "N/A"} Candidate
                      </div>
                    ) : (
                      <>
                        <div className="text-lg transition-colors group-hover:text-white">
                          {user.department ?? "No Department"}
                        </div>
                        {user.specialization ? (
                          <div className="text-sm text-black/70 transition-colors group-hover:text-white/80">
                            {user.specialization}
                          </div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-6">
                    <span
                      className={`inline-block rounded-full border-2 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white ${
                        user.isActive
                          ? "border-black text-black"
                          : "border-gray-300 text-black/40"
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
                      className="rounded-xl border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition group-hover:border-white group-hover:bg-transparent group-hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
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
            className="group rounded-[24px] border border-gray-300 bg-white p-6 transition-all hover:bg-black"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-black tracking-tight text-black transition-colors group-hover:text-white">
                  {user.displayName}
                </p>
                <p className="text-sm font-medium text-black/60 transition-colors group-hover:text-white/80">
                  {user.email}
                </p>
              </div>
              <span className="shrink-0 rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white">
                {user.role}
              </span>
            </div>
            <button
              type="button"
              disabled={!user.isActive}
              onClick={() => void handleDeactivate(user.id)}
              className="mt-6 w-full rounded-xl border-2 border-black bg-white py-3 text-xs font-black uppercase tracking-widest text-black transition group-hover:border-white group-hover:bg-transparent group-hover:text-white disabled:opacity-20"
            >
              Deactivate Account
            </button>
          </article>
        ))}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[30px] border-4 border-black bg-white p-8 shadow-[15px_15px_0px_black]">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-4xl font-black tracking-tighter text-black">
                  Create User
                </h2>
                <p className="mt-2 text-lg font-medium text-black/60">
                  Provision a new system account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full border-2 border-black p-2 transition-colors hover:bg-black hover:text-white"
              >
                <svg
                  className="h-6 w-6"
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

            <form className="space-y-6" onSubmit={handleCreateUser}>
              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                    Email Address
                  </span>
                  <input
                    value={formValues.email}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 font-bold text-black outline-none focus:bg-gray-50"
                    placeholder="name@pdn.ac.lk"
                  />
                </label>

                <label className="space-y-2">
                  <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                    Full Name
                  </span>
                  <input
                    value={formValues.displayName}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 font-bold text-black outline-none focus:bg-gray-50"
                    placeholder="Enter name"
                  />
                </label>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                    System Role
                  </span>
                  <CustomSelect
                    value={formValues.role}
                    onChange={(val) =>
                      setFormValues((c) => ({ ...c, role: val }))
                    }
                    options={adminManagedRoles}
                    labelMap={createRoleLabels}
                    fullWidth
                  />
                </label>

                {formValues.role === "STUDENT" ? (
                  <label className="space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                      Program
                    </span>
                    <CustomSelect
                      value={formValues.programType}
                      onChange={(val) =>
                        setFormValues((c) => ({ ...c, programType: val }))
                      }
                      options={programOptions}
                      labelMap={programLabels}
                      fullWidth
                    />
                  </label>
                ) : (
                  <label className="space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-widest text-black/40">
                      Department
                    </span>
                    <input
                      value={formValues.department}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          department: event.target.value,
                        }))
                      }
                      className="w-full rounded-[0.75em] border-2 border-black bg-white px-5 py-4 font-bold text-black outline-none"
                      placeholder="e.g. Computer Engineering"
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-4 text-base font-black uppercase tracking-widest text-black/40 transition-colors hover:text-black"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group inline-block cursor-pointer rounded-[0.75em] bg-black text-base font-bold"
                >
                  <span className="block -translate-y-[0.2em] rounded-[0.75em] border-2 border-black bg-black box-border px-8 py-4 text-white transition-transform duration-100 ease-out group-hover:-translate-y-[0.33em] group-active:translate-y-0">
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

