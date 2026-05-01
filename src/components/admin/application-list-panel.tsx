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
          <div key={i} className="h-24 w-full rounded-xl bg-transparent"></div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-gray-300 bg-transparent p-6 text-black">{error}</div>;
  }

  if (applications.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-transparent p-12 text-center">
        <h3 className="text-xl font-semibold text-black">No pending applications</h3>
        <p className="mt-2 text-black">There are currently no new applications waiting for review.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-transparent shadow-none">
      <table className="w-full text-left text-base">
        <thead className="border-b border-gray-200 bg-transparent/50 text-base uppercase text-black">
          <tr>
            <th className="px-6 py-4 font-medium">Applicant</th>
            <th className="px-6 py-4 font-medium">Program</th>
            <th className="px-6 py-4 font-medium">Submitted</th>
            <th className="px-6 py-4 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {applications.map((app) => (
            <tr key={app.id} className="transition-colors hover:bg-transparent/25">
              <td className="px-6 py-4">
                <div className="font-medium text-black">{app.applicantName}</div>
                <div className="text-black">{app.applicantEmail}</div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex rounded-full bg-transparent px-2.5 py-1 text-base font-medium text-black">
                  {app.programType}
                </span>
              </td>
              <td className="px-6 py-4 text-black">
                {format(new Date(app.createdAt), "MMM d, yyyy")}
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/dashboard/admin/applications/${app.id}`}
                  className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-base font-semibold text-black transition-colors hover:bg-black"
                >
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
