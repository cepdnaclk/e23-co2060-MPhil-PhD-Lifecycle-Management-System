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
      <div className="rounded-2xl border-2 border-black bg-white px-6 py-4 text-base font-bold text-black shadow-[4px_4px_0px_black]">
        {error}
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-gray-300 bg-white p-12 text-center">
        <h3 className="text-2xl font-black tracking-tight text-black">
          No pending applications
        </h3>
        <p className="mt-2 text-base font-medium text-black/70">
          There are currently no new applications waiting for review.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-gray-300 bg-white">
      <table className="w-full text-left text-base">
        <thead className="border-b border-gray-300 bg-white text-base uppercase text-black">
          <tr>
            <th className="px-6 py-5 text-[14px] font-black tracking-[0.2em] text-black/40">Applicant</th>
            <th className="px-6 py-5 text-[14px] font-black tracking-[0.2em] text-black/40">Program</th>
            <th className="px-6 py-5 text-[14px] font-black tracking-[0.2em] text-black/40">Submitted</th>
            <th className="px-6 py-5 text-right text-[14px] font-black tracking-[0.2em] text-black/40">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {applications.map((app) => (
            <tr key={app.id} className="group transition-colors hover:bg-black">
              <td className="px-6 py-4">
                <div className="text-lg font-black tracking-tight text-black transition-colors group-hover:text-white">{app.applicantName}</div>
                <div className="font-medium text-black/70 transition-colors group-hover:text-white/80">{app.applicantEmail}</div>
              </td>
              <td className="px-6 py-4">
                <span className="inline-flex rounded-full border-2 border-black bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black transition-colors group-hover:border-white group-hover:bg-transparent group-hover:text-white">
                  {app.programType}
                </span>
              </td>
              <td className="px-6 py-4 font-medium text-black/80 transition-colors group-hover:text-white/80">
                {format(new Date(app.createdAt), "MMM d, yyyy")}
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/dashboard/admin/applications/${app.id}`}
                  className="rounded-xl border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-black transition group-hover:border-white group-hover:bg-transparent group-hover:text-white"
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
