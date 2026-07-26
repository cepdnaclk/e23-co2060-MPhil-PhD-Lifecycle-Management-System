import { ProgramType, StudyMode, UserRole } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import {
  DepartmentProgressTableError,
  exportDepartmentProgressTable,
  listDepartmentProgressTable,
} from "@/lib/progress/department-tables";
import { withAuth } from "@/lib/firebase/with-auth";

export const GET = withAuth(async (request: NextRequest, context) => {
  const query = request.nextUrl.searchParams;
  const filters = {
    programType: query.get("programType") ?? ProgramType.MPHIL,
    studyMode: query.get("studyMode") ?? StudyMode.FULL_TIME,
    query: query.get("query") || undefined,
    page: query.get("page") ?? 1,
    limit: query.get("limit") ?? 25,
  };
  try {
    if (query.get("format") === "csv") {
      const result = await exportDepartmentProgressTable(filters, context.auth);
      return new NextResponse(result.csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="progress-${filters.programType}-${filters.studyMode}.csv"`,
          "X-Export-Row-Count": String(result.rowCount),
        },
      });
    }
    return NextResponse.json(await listDepartmentProgressTable(filters, context.auth));
  } catch (error) {
    if (error instanceof DepartmentProgressTableError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to load progress table." }, { status: 500 });
  }
}, [UserRole.ADMINISTRATOR, UserRole.HOD, UserRole.SUPERVISOR]);
