import { SupervisorStudentProfile } from "@/components/supervisor/supervisor-student-profile";

export default async function SupervisorStudentProfilePage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  return <SupervisorStudentProfile studentId={params.id} />;
}
