"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type StudentProfilePayload = {
  id: string;
  userId: string;
  programType: string;
  academicStatus: string;
  enrollmentDate: string | Date;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  supervisors: Array<{
    userId: string;
    displayName: string;
    email: string;
  }>;
};

function formatDateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function SupervisorStudentProfile({
  studentId,
}: {
  studentId: string;
}) {
  const [student, setStudent] = useState<StudentProfilePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/students/${studentId}`, {
          cache: "no-store",
        });
        
        const responseText = await response.text();
        let payload: { error?: string; student?: StudentProfilePayload } = {};

        try {
          payload = JSON.parse(responseText);
        } catch (e) {
          console.error("Failed to parse student profile response:", responseText);
          throw new Error(`Invalid response from server (${response.status}). Please check console logs.`);
        }

        if (!response.ok || !payload.student) {
          throw new Error(payload.error ?? "Unable to load the student profile.");
        }

        if (isMounted) {
          setStudent(payload.student);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the student profile.",
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
  }, [studentId]);

  if (isLoading) {
    return (
      <div className="rounded-[2rem] border border-gray-200 bg-transparent p-6 text-base text-black">
        Loading student profile...
      </div>
    );
  }

  if (errorMessage || !student) {
    return (
      <div className="rounded-[2rem] border border-gray-300 bg-transparent px-5 py-4 text-base text-black">
        {errorMessage ?? "Student profile could not be loaded."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200 bg-transparent/75 p-5 shadow-none sm:p-7">
        <Link
          href="/dashboard/supervisor/students"
          className="text-base font-medium text-black transition hover:text-black"
        >
          Back to My Students
        </Link>
        <h2 className="mt-4 text-3xl font-semibold text-black sm:text-4xl">
          {student.user.displayName}
        </h2>
        <p className="mt-2 text-base text-black">{student.user.email}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-transparent/60 px-4 py-4">
            <p className="text-base uppercase tracking-[0.18em] text-gray-400">
              Programme
            </p>
            <p className="mt-2 text-lg font-semibold text-black">
              {student.programType}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-transparent/60 px-4 py-4">
            <p className="text-base uppercase tracking-[0.18em] text-gray-400">
              Academic status
            </p>
            <p className="mt-2 text-lg font-semibold text-black">
              {student.academicStatus}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-transparent/60 px-4 py-4">
            <p className="text-base uppercase tracking-[0.18em] text-gray-400">
              Enrolled
            </p>
            <p className="mt-2 text-lg font-semibold text-black">
              {formatDateLabel(student.enrollmentDate)}
            </p>
          </div>
        </div>
      </section>

      <section
        id="research-proposals"
        className="rounded-[2rem] border border-gray-200 bg-transparent p-5 sm:p-7"
      >
        <p className="text-base font-semibold uppercase tracking-[0.2em] text-black">
          Research Proposals
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-black">
          Proposal history access
        </h3>
        <p className="mt-3 text-base leading-6 text-black">
          Use this student profile as your anchor point before opening proposal
          workflow actions and historical review pages tied to the assigned student.
        </p>
      </section>

      <section
        id="progress-reports"
        className="rounded-[2rem] border border-gray-200 bg-transparent p-5 sm:p-7"
      >
        <p className="text-base font-semibold uppercase tracking-[0.2em] text-black">
          Progress Reports
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-black">
          Progress reporting context
        </h3>
        <p className="mt-3 text-base leading-6 text-black">
          This workspace keeps the assigned student context visible while you review
          their academic progress and coordinate future reporting follow-up.
        </p>
      </section>
    </div>
  );
}
