import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DashboardPageProps = {
  params: {
    role: string;
  };
};

export default function DashboardRolePage({ params }: DashboardPageProps) {
  const isAdmin = params.role === "admin";

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Dashboard
          </p>
          <CardTitle className="text-3xl capitalize">{params.role} Workspace</CardTitle>
          <CardDescription className="pt-2">
            This role landing page confirms the authenticated redirect path for your session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <Button className="mt-4 w-full" render={<Link href="/dashboard/admin/users">Open user management</Link>} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
