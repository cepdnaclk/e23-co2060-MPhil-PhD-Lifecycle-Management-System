import { SubmissionDocumentDownloadButton } from "@/components/student/submission-document-download-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ThesisFinalizationItem = {
  id: string;
  title: string;
  status: string;
  student: {
    user: {
      displayName: string;
      email: string;
    };
  };
  correctionOrders: Array<{
    id: string;
    requirementType: string;
    requiresExaminerReview: boolean;
    requirements: string;
    status: string;
    createdAt: string | Date;
    submissions: Array<{
      id: string;
      versionNumber: number;
      responseSummary: string;
      submittedAt: string | Date;
      documents: Array<{
        id: string;
        fileName: string;
      }>;
    }>;
  }>;
};

export function ThesisFinalizationPanel({
  theses,
}: {
  theses: ThesisFinalizationItem[];
}) {
  return (
    <div className="flex-1 space-y-5 p-4 pt-6 md:p-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Thesis Correction Monitoring
        </h2>
        <p className="mt-2 text-muted-foreground">
          Monitor ordered correction versions and academic review state.
          Completion, graduation, and archive remain separate controlled steps.
        </p>
      </div>

      {theses.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No thesis correction records require monitoring.
          </CardContent>
        </Card>
      ) : (
        theses.map((thesis) => (
          <Card key={thesis.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{thesis.title}</CardTitle>
                  <CardDescription>
                    {thesis.student.user.displayName} ·{" "}
                    {thesis.student.user.email}
                  </CardDescription>
                </div>
                <Badge>{thesis.status.replaceAll("_", " ")}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {thesis.correctionOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No HOD correction order is recorded.
                </p>
              ) : (
                thesis.correctionOrders.map((order) => (
                  <div key={order.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">
                        {order.requirementType} corrections
                      </p>
                      <Badge variant="secondary">
                        {order.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {order.requirements}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Examiner review{" "}
                      {order.requiresExaminerReview
                        ? "required"
                        : "not required"}
                    </p>

                    <div className="mt-4 space-y-3">
                      {order.submissions.map((submission) => (
                        <div
                          key={submission.id}
                          className="rounded-md bg-muted/30 p-3"
                        >
                          <p className="text-sm font-medium">
                            Version {submission.versionNumber}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {submission.responseSummary}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {submission.documents.map((document) => (
                              <SubmissionDocumentDownloadButton
                                key={document.id}
                                documentId={document.id}
                                fileName={document.fileName}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
