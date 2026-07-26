"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { secureFetch } from "@/lib/security/client-request";
import type { DashboardRole } from "@/types/dashboard";

type ProfileIdentity = {
  displayName: string | null;
  email: string | null;
};

const ROLE_LABELS: Record<DashboardRole, string> = {
  student: "Student",
  supervisor: "Supervisor",
  examiner: "Examiner",
  admin: "Administrator",
  hod: "Head of Department",
};

export function ProfileDropdown({ role }: { role: DashboardRole }) {
  const [identity, setIdentity] = useState<ProfileIdentity | null>(null);

  useEffect(() => {
    let active = true;
    void secureFetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ProfileIdentity;
      })
      .then((value) => {
        if (active && value) setIdentity(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const displayName = identity?.displayName || ROLE_LABELS[role];
  const initials = useMemo(
    () =>
      displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "U",
    [displayName],
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full"
          aria-label={`Open profile menu for ${displayName}`}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-none font-medium">{displayName}</p>
            {identity?.email ? (
              <p className="text-xs leading-none text-muted-foreground">
                {identity.email}
              </p>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
          <Link href="/logout">
            Sign out
            <DropdownMenuShortcut className="text-current">
              ⇧⌘Q
            </DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
