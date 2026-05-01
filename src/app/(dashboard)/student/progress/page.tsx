import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { StudentProgressDashboard } from "@/components/student/student-progress-dashboard";
import { getCurrentUser } from "@/lib/firebase/auth";
import { prisma } from "@/lib/prisma/client";
import { getStudentProgressById } from "@/lib/students/progress";

export default async function StudentProgressPage() {
  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const auth = await getCurrentUser({
    headers: new Headers({
      cookie: cookieHeader,
    }),
  });

  if (!auth || auth.role !== "STUDENT") {
    redirect("/login");
  }

  const student = await prisma.student.findUnique({
    where: {
      userId: auth.userId,
    },
    select: {
      id: true,
    },
  });

  if (!student) {
    redirect("/dashboard/student");
  }

  const progress = await getStudentProgressById(student.id, auth);

  return <StudentProgressDashboard progress={progress} />;
}
