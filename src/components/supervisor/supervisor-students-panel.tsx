"use client";

import Link from "next/link";
import { ProgramType, RegistrationStatus } from "@prisma/client";
import { useEffect, useState } from "react";



type SupervisorStudentListItem = {
  assignmentId: string;
  assignedAt: string | Date;
  isPrimary: boolean;
  student: {
    id: string;
    userId: string;
    displayName: string;
    email: string;
    programType: ProgramType;
    academicStatus: string;
  };
  currentRegistration: {
    id: string;
    status: RegistrationStatus;
    startDate: string | Date;
    expirationDate: string | Date;
  } | null;
  latestProposal: {
    id: string;
    title: string;
    status: string;
    updatedAt: string | Date;
  } | null;
};

const EMPTY_STUDENTS: SupervisorStudentListItem[] = [];

function formatDateLabel(value: string | Date | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getRegistrationBadgeClassName(status: RegistrationStatus | "UNKNOWN") {
  switch (status) {
    case RegistrationStatus.ACTIVE:
      return "border border-gray-300 bg-transparent text-black";
    case RegistrationStatus.LAPSED:
      return "border border-gray-300 bg-transparent text-black";
    case RegistrationStatus.ARCHIVED:
      return "border border-gray-400/30 bg-transparent text-black";
    default:
      return "border border-gray-300/40 bg-transparent text-black";
  }
}

function getProposalBadgeClassName(status: string | null) {
  switch (status) {
    case "APPROVED":
      return "border border-gray-300 bg-transparent text-black";
    case "UNDER_REVIEW":
      return "border border-gray-300 bg-transparent text-black";
    case "REJECTED":
      return "border border-gray-300 bg-transparent text-black";
    case "SUBMITTED":
      return "border border-gray-300 bg-transparent text-black";
    default:
      return "border border-gray-300/40 bg-transparent text-black";
  }
}

function getRegistrationLabel(
  registration: SupervisorStudentListItem["currentRegistration"],
) {
  return registration?.status ?? "UNKNOWN";
}

function getProposalLabel(proposal: SupervisorStudentListItem["latestProposal"]) {
  return proposal?.status ?? "NO_PROPOSAL";
}

export function SupervisorStudentsPanel({
  initialStudents = EMPTY_STUDENTS,
}: {
  initialStudents?: SupervisorStudentListItem[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [programFilter, setProgramFilter] = useState<"ALL" | "MPHIL" | "PHD">(
    "ALL",
  );
  const [registrationFilter, setRegistrationFilter] = useState<
    "ALL" | "ACTIVE" | "LAPSED"
  >("ALL");
  const [isLoading, setIsLoading] = useState(initialStudents.length === 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialStudents.length > 0) {
      return;
    }

    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const response = await fetch("/api/supervisor/students", {
          cache: "no-store",
        });
        
        const responseText = await response.text();
        let payload: { error?: string; students?: SupervisorStudentListItem[] } = {};
        
        try {
          payload = JSON.parse(responseText);
        } catch (e) {
          console.error("Failed to parse supervisor students response:", responseText);
          throw new Error(`Invalid response from server (${response.status}). Please check console logs.`);
        }

        if (!response.ok || !payload.students) {
          throw new Error(payload.error ?? "Unable to load assigned students.");
        }

        if (isMounted) {
          setStudents(payload.students);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load assigned students.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredStudents = students.filter((entry) => {
    const registrationLabel = getRegistrationLabel(entry.currentRegistration);

    if (programFilter !== "ALL" && entry.student.programType !== programFilter) {
      return false;
    }

    if (registrationFilter !== "ALL" && registrationLabel !== registrationFilter) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent/75 p-5 shadow-none sm:p-7">
        <p className="text-base font-semibold uppercase tracking-[0.26em] text-black">
          Supervisor Workspace
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-black sm:text-4xl">
          My Students
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-6 text-black">
          Review assigned postgraduate researchers, spot lapsed registrations, and
          jump directly to each student&apos;s profile, proposal history, and progress
          reporting context.
        </p>
      </section>

      <section className="grid gap-3 rounded-[2rem] border border-gray-200 bg-transparent p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        <label className="space-y-2 text-base text-black">
          <span>Program Type</span>
          <select
            value={programFilter}
            onChange={(event) =>
              setProgramFilter(event.target.value as typeof programFilter)
            }
            className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
          >
            <option value="ALL">All programmes</option>
            <option value="MPHIL">MPhil</option>
            <option value="PHD">PhD</option>
          </select>
        </label>
        <label className="space-y-2 text-base text-black">
          <span>Registration Status</span>
          <select
            value={registrationFilter}
            onChange={(event) =>
              setRegistrationFilter(
                event.target.value as typeof registrationFilter,
              )
            }
            className="w-full rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-black outline-none focus:border-gray-300"
          >
            <option value="ALL">All registrations</option>
            <option value="ACTIVE">Active</option>
            <option value="LAPSED">Lapsed</option>
          </select>
        </label>
        <div className="rounded-2xl border border-gray-200 bg-transparent/60 px-4 py-4 text-base text-black">
          <p className="text-base uppercase tracking-[0.2em] text-gray-400">
            Filtered students
          </p>
          <p className="mt-2 text-2xl font-semibold text-black">
            {filteredStudents.length}
          </p>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-gray-300 bg-transparent px-4 py-3 text-base text-black">
          {errorMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-[2rem] border border-gray-200 bg-transparent p-6 text-base text-black">
          Loading assigned students...
        </div>
      ) : null}

      {!isLoading && filteredStudents.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-gray-300 bg-transparent/50 px-5 py-8 text-base text-black">
          No assigned students matched the current filters.
        </div>
      ) : null}

      {!isLoading && filteredStudents.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-[2rem] border border-gray-200 bg-transparent sm:block">
            <table className="min-w-full divide-y divide-slate-800 text-base">
              <thead className="bg-transparent text-left text-black">
                <tr>
                  <th className="px-5 py-4 font-medium">Student</th>
                  <th className="px-5 py-4 font-medium">Programme</th>
                  <th className="px-5 py-4 font-medium">Registration</th>
                  <th className="px-5 py-4 font-medium">Latest Proposal</th>
                  <th className="px-5 py-4 font-medium">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredStudents.map((entry) => {
                  const registrationLabel = getRegistrationLabel(
                    entry.currentRegistration,
                  );
                  const proposalLabel = getProposalLabel(entry.latestProposal);

                  return (
                    <tr key={entry.assignmentId} className="align-top">
                      <td className="px-5 py-5">
                        <Link
                          href={`/dashboard/supervisor/students/${entry.student.id}`}
                          className="text-base font-semibold text-black transition hover:text-black"
                        >
                          {entry.student.displayName}
                        </Link>
                        <p className="mt-1 text-black">{entry.student.email}</p>
                        <p className="mt-2 text-base uppercase tracking-[0.18em] text-gray-400">
                          {entry.isPrimary ? "Primary supervisor" : "Co-supervisor"} ·
                          Assigned {formatDateLabel(entry.assignedAt)}
                        </p>
                      </td>
                      <td className="px-5 py-5 text-black">
                        {entry.student.programType}
                      </td>
                      <td className="px-5 py-5">
                        <span
                          data-testid={`registration-badge-${entry.student.id}`}
                          className={`inline-flex rounded-full px-3 py-1 text-base font-semibold uppercase tracking-[0.18em] ${getRegistrationBadgeClassName(
                            registrationLabel,
                          )}`}
                        >
                          {registrationLabel}
                        </span>
                        <p className="mt-2 text-base text-gray-400">
                          Expires{" "}
                          {formatDateLabel(entry.currentRegistration?.expirationDate)}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-base font-semibold uppercase tracking-[0.18em] ${getProposalBadgeClassName(
                            entry.latestProposal?.status ?? null,
                          )}`}
                        >
                          {proposalLabel}
                        </span>
                        <p className="mt-2 text-base text-gray-400">
                          {entry.latestProposal
                            ? `${entry.latestProposal.title} · updated ${formatDateLabel(entry.latestProposal.updatedAt)}`
                            : "No proposal submitted yet."}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/dashboard/supervisor/students/${entry.student.id}`}
                            className="text-black transition hover:text-black"
                          >
                            Open profile
                          </Link>
                          <Link
                            href={`/dashboard/supervisor/students/${entry.student.id}#research-proposals`}
                            className="text-black transition hover:text-black"
                          >
                            Research proposal history
                          </Link>
                          <Link
                            href={`/dashboard/supervisor/students/${entry.student.id}#progress-reports`}
                            className="text-black transition hover:text-black"
                          >
                            Progress report history
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 sm:hidden">
            {filteredStudents.map((entry) => {
              const registrationLabel = getRegistrationLabel(
                entry.currentRegistration,
              );
              const proposalLabel = getProposalLabel(entry.latestProposal);

              return (
                <article
                  key={entry.assignmentId}
                  className="rounded-[1.75rem] border border-gray-200 bg-transparent p-4 shadow-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/dashboard/supervisor/students/${entry.student.id}`}
                        className="text-lg font-semibold text-black transition hover:text-black"
                      >
                        {entry.student.displayName}
                      </Link>
                      <p className="mt-1 break-all text-base text-black">
                        {entry.student.email}
                      </p>
                    </div>
                    <span className="rounded-full border border-gray-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-black">
                      {entry.student.programType}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span
                      data-testid={`registration-badge-mobile-${entry.student.id}`}
                      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getRegistrationBadgeClassName(
                        registrationLabel,
                      )}`}
                    >
                      {registrationLabel}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getProposalBadgeClassName(
                        entry.latestProposal?.status ?? null,
                      )}`}
                    >
                      {proposalLabel}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-base text-black">
                    <p>
                      <span className="text-gray-400">Assigned:</span>{" "}
                      {formatDateLabel(entry.assignedAt)}
                    </p>
                    <p>
                      <span className="text-gray-400">Registration expires:</span>{" "}
                      {formatDateLabel(entry.currentRegistration?.expirationDate)}
                    </p>
                    <p>
                      <span className="text-gray-400">Proposal:</span>{" "}
                      {entry.latestProposal?.title ?? "No proposal submitted yet."}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <Link
                      href={`/dashboard/supervisor/students/${entry.student.id}`}
                      className="rounded-2xl bg-black px-4 py-3 text-center text-base font-semibold text-black"
                    >
                      Open profile
                    </Link>
                    <Link
                      href={`/dashboard/supervisor/students/${entry.student.id}#research-proposals`}
                      className="rounded-2xl border border-gray-300 px-4 py-3 text-center text-base font-medium text-black"
                    >
                      Proposal history
                    </Link>
                    <Link
                      href={`/dashboard/supervisor/students/${entry.student.id}#progress-reports`}
                      className="rounded-2xl border border-gray-300 px-4 py-3 text-center text-base font-medium text-black"
                    >
                      Progress reports
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
