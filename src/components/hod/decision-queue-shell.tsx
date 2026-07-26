import { ShieldCheck } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function HodDecisionQueueShell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5" />
            <div>
              <CardTitle>HOD decision queue</CardTitle>
              <CardDescription>
                Only the Head of Department can execute decisions in this
                workspace.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Eligible records appear here when they have passed every preceding
          lifecycle gate.
        </CardContent>
      </Card>
    </div>
  );
}
