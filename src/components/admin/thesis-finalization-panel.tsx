import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2 } from "lucide-react";

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
  corrections: Array<{
    id: string;
    correctionType: string;
    description: string | null;
    isApproved: boolean;
    createdAt: string | Date;
    documents: Array<{
      id: string;
      fileName: string;
      storagePath: string;
    }>;
  }>;
};

export function ThesisFinalizationPanel({
  theses,
}: {
  theses: ThesisFinalizationItem[];
}) {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Finalize Theses</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Completion, graduation, and archival are recorded as separate controlled steps.
      </p>

      <div className="space-y-6">
        {theses.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No thesis records currently need final archiving.
            </CardContent>
          </Card>
        ) : (
          theses.map((thesis) => {
            return (
              <Card key={thesis.id}>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <Badge variant="secondary" className="uppercase mb-2">
                        {thesis.status.replaceAll("_", " ")}
                      </Badge>
                      <CardTitle className="text-xl">{thesis.title}</CardTitle>
                      <CardDescription>
                        Candidate: {thesis.student.user.displayName} • {thesis.student.user.email}
                      </CardDescription>
                    </div>

                    <Badge variant="outline">Awaiting controlled completion workflow</Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                      Corrections
                    </h4>

                    {thesis.corrections.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">No corrections submitted</p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {thesis.corrections.map((correction) => (
                          <div
                            key={correction.id}
                            className="flex flex-col justify-between rounded-md border p-4 space-y-4"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  {correction.correctionType} Correction
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(correction.createdAt).toLocaleDateString()}
                                </span>
                              </div>

                              {correction.description && (
                                <p className="text-sm italic text-muted-foreground">
                                  &quot;{correction.description}&quot;
                                </p>
                              )}

                              <div className="space-y-2">
                                {correction.documents.map((doc) => (
                                  <div key={doc.id} className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <span className="truncate text-sm font-medium">{doc.fileName}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <Badge variant={correction.isApproved ? "default" : "secondary"}>
                              {correction.isApproved && <CheckCircle2 className="mr-2 h-4 w-4" />}
                              {correction.isApproved ? "Previously approved" : "Legacy record"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
