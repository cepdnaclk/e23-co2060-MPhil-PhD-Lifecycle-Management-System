"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import {
  optionalSanitizedString,
  sanitizedEmail,
  sanitizedString,
} from "@/lib/validation/schemas";
import { z } from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";

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
      const query = roleFilter === "ALL" ? "" : `?role=${encodeURIComponent(roleFilter)}`;
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to load users.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers(selectedRole);
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the user.");
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to deactivate the user.");
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Accounts</h2>
          <p className="text-muted-foreground">
            Review and update access for students, supervisors, examiners, and staff.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedRole} onValueChange={(val) => setSelectedRole(val as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {roleFilterOptions.map((role) => (
                <SelectItem key={role} value={role}>
                  {roleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => setIsModalOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Create User
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p>{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <p>{successMessage}</p>
        </div>
      )}

      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            {selectedRole === "ALL" ? "Showing all accounts." : `Showing ${selectedRole.toLowerCase()} accounts.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right px-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Loading user records...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No matching users.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="px-6">
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.role === "STUDENT" ? (
                        <span className="font-medium">{user.programType ?? "N/A"} Candidate</span>
                      ) : (
                        <div className="flex flex-col">
                          <span className="font-medium">{user.department ?? "No Department"}</span>
                          {user.specialization && (
                            <span className="text-xs text-muted-foreground">{user.specialization}</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "outline"} className={user.isActive ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400" : ""}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!user.isActive}
                        onClick={() => void handleDeactivate(user.id)}
                      >
                        Deactivate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Provision a new system account. A welcome email will be sent automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@pdn.ac.lk"
                  value={formValues.email}
                  onChange={(e) => setFormValues({ ...formValues, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Full Name</Label>
                <Input
                  id="displayName"
                  placeholder="Enter name"
                  value={formValues.displayName}
                  onChange={(e) => setFormValues({ ...formValues, displayName: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>System Role</Label>
                <Select
                  value={formValues.role}
                  onValueChange={(val) => setFormValues({ ...formValues, role: val as AdminManagedRole })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminManagedRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {createRoleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formValues.role === "STUDENT" ? (
                <div className="space-y-2">
                  <Label>Program</Label>
                  <Select
                    value={formValues.programType}
                    onValueChange={(val) => setFormValues({ ...formValues, programType: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select program" />
                    </SelectTrigger>
                    <SelectContent>
                      {programOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {programLabels[opt]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    placeholder="e.g. Computer Engineering"
                    value={formValues.department}
                    onChange={(e) => setFormValues({ ...formValues, department: e.target.value })}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Confirm Creation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
