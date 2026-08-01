"use client";

import {
  Archive,
  Download,
  FileText,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { secureFetch } from "@/lib/security/client-request";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DecisionReviewDialog } from "@/components/ui/decision-review-dialog";
import { WorkflowFeedback } from "@/components/ui/workflow-feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RepositoryRole = "student" | "supervisor" | "examiner" | "admin";

type RepositoryDocument = {
  id: string;
  documentType: string;
  fileName: string;
  title: string | null;
  summary: string | null;
  tags: string[];
  mimeType: string;
  version: number;
  isCurrentVersion: boolean;
  storagePath: string;
  createdAt: string | Date;
};

type DocumentsResponse = {
  documents?: RepositoryDocument[];
  error?: string;
};

type DownloadResponse = {
  downloadUrl?: string;
  error?: string;
};

type RepositoryFilters = {
  q: string;
  category: string;
  tag: string;
  startDate: string;
  endDate: string;
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "APPLICATION_ATTACHMENT", label: "Applications" },
  { value: "PROPOSAL", label: "Proposals" },
  { value: "ETHICS_APPROVAL", label: "Ethics approvals" },
  { value: "PROGRESS_REPORT", label: "Progress reports" },
  { value: "THESIS", label: "Theses" },
  { value: "CORRECTION", label: "Corrections" },
];

const TAG_OPTIONS = [
  { value: "", label: "Any tag" },
  { value: "current", label: "Current version" },
  { value: "ethics-approval", label: "Ethics approval" },
  { value: "submitted", label: "Submitted" },
  { value: "under-review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "under-examination", label: "Under examination" },
  { value: "overdue", label: "Overdue" },
  { value: "signed-off", label: "Signed off" },
  { value: "correction", label: "Correction" },
];

function getCategoryLabel(documentType: string) {
  return (
    CATEGORY_OPTIONS.find((option) => option.value === documentType)?.label ??
    documentType.replaceAll("_", " ")
  );
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function buildQueryString(input: RepositoryFilters) {
  const params = new URLSearchParams();

  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.category) params.set("category", input.category);
  if (input.tag) params.set("tag", input.tag);
  if (input.startDate) params.set("startDate", input.startDate);
  if (input.endDate) params.set("endDate", input.endDate);

  return params.toString();
}

function getDefaultFilters(role: RepositoryRole): RepositoryFilters {
  return {
    q: "",
    category: role === "examiner" ? "THESIS" : "",
    tag: "",
    startDate: "",
    endDate: "",
  };
}

export function DocumentRepositoryPanel({ role }: { role: RepositoryRole }) {
  const defaultFilters = useMemo(() => getDefaultFilters(role), [role]);
  const [documents, setDocuments] = useState<RepositoryDocument[]>([]);
  const [filters, setFilters] = useState<RepositoryFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [pendingArchive, setPendingArchive] = useState<RepositoryDocument | null>(null);

  const categoryOptions = useMemo(
    () =>
      role === "examiner"
        ? CATEGORY_OPTIONS.filter(
            (option) => option.value === "" || option.value === "THESIS",
          )
        : CATEGORY_OPTIONS,
    [role],
  );

  const loadDocuments = useCallback(async (nextFilters: RepositoryFilters) => {
    setIsLoading(true);
    setMessage(null);
    setError(null);

    try {
      const queryString = buildQueryString(nextFilters);
      const response = await secureFetch(
        `/api/documents${queryString ? `?${queryString}` : ""}`,
        { credentials: "include" },
      );
      const payload = (await response.json()) as DocumentsResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load documents.");
      }

      setDocuments(payload.documents ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load documents.");
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments(defaultFilters);
  }, [defaultFilters, loadDocuments]);

  function updateFilter<Key extends keyof RepositoryFilters>(
    key: Key,
    value: RepositoryFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadDocuments(filters);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    void loadDocuments(defaultFilters);
  }

  async function handleDownload(document: RepositoryDocument) {
    setBusyId(`download-${document.id}`);
    setMessage(null);
    setError(null);

    try {
      const response = await secureFetch(`/api/documents/${document.id}`, {
        credentials: "include",
      });
      const payload = (await response.json()) as DownloadResponse;

      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error ?? "Unable to prepare the document download.");
      }

      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
      setMessage(`Secure download opened for ${document.fileName}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open document download.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(document: RepositoryDocument) {
    setBusyId(`archive-${document.id}`);
    setMessage(null);
    setError(null);

    try {
      const response = await secureFetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to archive the document.");
      }

      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setMessage(`${document.fileName} archived from the repository.`);
      setCompletedAt(new Date());
      setPendingArchive(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to archive document.");
    } finally {
      setBusyId(null);
    }
  }

  function renderActions(document: RepositoryDocument) {
    const isDownloading = busyId === `download-${document.id}`;
    const isArchiving = busyId === `archive-${document.id}`;

    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleDownload(document)}
          disabled={isDownloading || isArchiving}
        >
          {isDownloading ? (
            <RefreshCw className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {isDownloading ? "Opening..." : "Download"}
        </Button>
        {role === "admin" && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setPendingArchive(document)}
            disabled={isDownloading || isArchiving}
          >
            {isArchiving ? (
              <RefreshCw className="animate-spin" aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            {isArchiving ? "Archiving..." : "Archive"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight">Document Repository</h1>
          <p className="mt-2 text-muted-foreground">
            Find lifecycle records and open secure document downloads.
            {role === "admin" ? " Archived records are removed from active views." : ""}
          </p>
        </div>
        <Badge variant="outline" className="w-fit normal-case">
          {isLoading ? "Updating results" : `${documents.length} visible`}
        </Badge>
      </header>

      <div className="space-y-3">
        <WorkflowFeedback error={error} success={message} completedAt={completedAt} />
      </div>

      <DecisionReviewDialog
        open={Boolean(pendingArchive)}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null);
        }}
        title="Archive document"
        description="Review the repository change before removing this document from active views."
        subjectLabel="Document"
        subject={pendingArchive?.fileName ?? ""}
        decision="Archive from active repository views"
        consequences={[
          "The document will disappear from active repository results.",
          "The stored file and lifecycle association will be retained.",
          "Existing audit history remains available to authorised staff.",
        ]}
        reversible={false}
        destructive
        confirmLabel="Archive document"
        pendingLabel="Archiving..."
        isPending={Boolean(pendingArchive && busyId === `archive-${pendingArchive.id}`)}
        onConfirm={() => {
          if (pendingArchive) void handleArchive(pendingArchive);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Search documents</CardTitle>
          <CardDescription>
            Combine any of the filters below, then search to update the repository results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-[1.4fr_0.9fr_0.9fr]">
              <div className="space-y-2">
                <Label htmlFor="repository-search">Search</Label>
                <Input
                  id="repository-search"
                  value={filters.q}
                  onChange={(event) => updateFilter("q", event.target.value)}
                  placeholder="Filename, title, summary, or period"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repository-category">Category</Label>
                <Select
                  value={filters.category || "all"}
                  onValueChange={(value: string) =>
                    updateFilter("category", value === "all" ? "" : value)
                  }
                >
                  <SelectTrigger id="repository-category">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value || "all"} value={option.value || "all"}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="repository-tag">Tag</Label>
                <Select
                  value={filters.tag || "any"}
                  onValueChange={(value: string) =>
                    updateFilter("tag", value === "any" ? "" : value)
                  }
                >
                  <SelectTrigger id="repository-tag">
                    <SelectValue placeholder="Any tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_OPTIONS.map((option) => (
                      <SelectItem key={option.value || "any"} value={option.value || "any"}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="repository-start-date">From</Label>
                <Input
                  id="repository-start-date"
                  type="date"
                  value={filters.startDate}
                  max={filters.endDate || undefined}
                  onChange={(event) => updateFilter("startDate", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repository-end-date">To</Label>
                <Input
                  id="repository-end-date"
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate || undefined}
                  onChange={(event) => updateFilter("endDate", event.target.value)}
                />
              </div>

              <Button type="button" variant="outline" onClick={resetFilters} disabled={isLoading}>
                <RotateCcw aria-hidden="true" />
                Reset
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <RefreshCw className="animate-spin" aria-hidden="true" />
                ) : (
                  <Search aria-hidden="true" />
                )}
                {isLoading ? "Searching..." : "Search"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>Repository results</CardTitle>
          <CardDescription>
            Current, role-accessible documents matching the applied filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
              <RefreshCw className="size-5 animate-spin text-primary" aria-hidden="true" />
              <span>Loading documents...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-4 font-semibold text-foreground">No documents found</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Try a broader search, change the date range, or reset all filters.
              </p>
            </div>
          ) : (
            <>
              <Table className="hidden table-fixed md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="w-[150px]">Category</TableHead>
                    <TableHead className="w-[180px]">Tags</TableHead>
                    <TableHead className="w-[100px]">Added</TableHead>
                    <TableHead className="w-[220px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell className="align-top">
                        <div className="font-semibold text-foreground">
                          {document.title ?? document.fileName}
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {document.fileName}
                        </p>
                        {document.summary && (
                          <p className="mt-2 line-clamp-2 max-w-xl text-sm text-muted-foreground">
                            {document.summary}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline">{getCategoryLabel(document.documentType)}</Badge>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          Version {document.version}{document.isCurrentVersion ? " · Current" : ""}
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex max-w-sm flex-wrap gap-1.5">
                          {document.tags.length > 0 ? (
                            document.tags.map((item) => (
                              <Badge key={`${document.id}-${item}`} variant="secondary">
                                {item}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No tags</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {formatDate(document.createdAt)}
                      </TableCell>
                      <TableCell className="align-top">{renderActions(document)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="divide-y md:hidden">
                {documents.map((document) => (
                  <article key={document.id} className="space-y-4 px-5 py-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-foreground">
                          {document.title ?? document.fileName}
                        </h2>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {document.fileName}
                        </p>
                      </div>
                    </div>

                    {document.summary && (
                      <p className="line-clamp-3 text-sm text-muted-foreground">{document.summary}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{getCategoryLabel(document.documentType)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Version {document.version}{document.isCurrentVersion ? " · Current" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDate(document.createdAt)}</span>
                    </div>

                    {document.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {document.tags.map((item) => (
                          <Badge key={`${document.id}-mobile-${item}`} variant="secondary">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="border-t pt-4">{renderActions(document)}</div>
                  </article>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
