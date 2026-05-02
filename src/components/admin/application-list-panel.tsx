"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format } from "date-fns";

type Application = {
  id: string;
  applicantName: string;
  applicantEmail: string;
  programType: string;
  status: string;
  createdAt: string;
};

export function ApplicationListPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchApplications() {
      try {
        const res = await fetch("/api/applications?status=SUBMITTED");
        if (!res.ok) throw new Error("Failed to load applications");
        const data = await res.json();
        setApplications(data.applications);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    void fetchApplications();
  }, []);

  if (isLoading) {
    return (
      <div className="flex animate-pulse flex-col space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-24 w-full rounded-2xl border border-black bg-white"
          ></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50/90 p-6 text-red-700">
        {error}
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="rounded-2xl border border-black bg-white p-12 text-center">
        <h3 className="text-xl font-semibold text-black">
          No pending applications
        </h3>
        <p className="mt-2 text-black/75">
          There are currently no new applications waiting for review.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <table className="w-full text-left text-base">
        <thead className="border-b border-black bg-neutral-100 text-base uppercase text-black">
          <tr>
            <th className="px-6 py-4 font-medium">Applicant</th>
            <th className="px-6 py-4 font-medium">Program</th>
            <th className="px-6 py-4 font-medium">Submitted</th>
            <th className="px-6 py-4 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black">
          {applications.map((app) => (
            <tr key={app.id} className="transition-colors hover:bg-neutral-100">
              <td className="px-6 py-4">
                <div className="font-medium text-black">{app.applicantName}</div>
                <div className="text-black/70">{app.applicantEmail}</div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex rounded-full border border-black bg-white px-2.5 py-1 text-base font-medium text-black">
                  {app.programType}
                </span>
              </td>
              <td className="px-6 py-4 text-black/80">
                {format(new Date(app.createdAt), "MMM d, yyyy")}
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/dashboard/admin/applications/${app.id}`}
                  className="theme-button theme-button--compact"
                >
                  <span className="theme-button__label">Review</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
