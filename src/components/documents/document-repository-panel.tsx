"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "APPLICATION_ATTACHMENT", label: "Applications" },
  { value: "PROPOSAL", label: "Proposals" },
  { value: "PROGRESS_REPORT", label: "Progress Reports" },
  { value: "THESIS", label: "Theses" },
  { value: "CORRECTION", label: "Corrections" },
];

const TAG_OPTIONS = [
  { value: "", label: "Any tag" },
  { value: "current", label: "Current version" },
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

function buildQueryString(input: {
  q: string;
  category: string;
  tag: string;
  startDate: string;
  endDate: string;
}) {
  const params = new URLSearchParams();

  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.category) params.set("category", input.category);
  if (input.tag) params.set("tag", input.tag);
  if (input.startDate) params.set("startDate", input.startDate);
  if (input.endDate) params.set("endDate", input.endDate);

  return params.toString();
}

export function DocumentRepositoryPanel({ role }: { role: RepositoryRole }) {
  const [documents, setDocuments] = useState<RepositoryDocument[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(role === "examiner" ? "THESIS" : "");
  const [tag, setTag] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () =>
      role === "examiner"
        ? CATEGORY_OPTIONS.filter((option) => option.value === "" || option.value === "THESIS")
        : CATEGORY_OPTIONS,
    [role],
  );

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const queryString = buildQueryString({
        q,
        category,
        tag,
        startDate,
        endDate,
      });
      const response = await fetch(`/api/documents${queryString ? `?${queryString}` : ""}`, {
        credentials: "include",
      });
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
  }, [category, endDate, q, startDate, tag]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadDocuments();
  }

  async function handleDownload(document: RepositoryDocument) {
    setBusyId(`download-${document.id}`);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
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
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        credentials: "include",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to archive the document.");
      }

      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setMessage(`${document.fileName} archived from the repository.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to archive document.");
    } finally {
      setBusyId(null);
    }
  }

  function resetFilters() {
    setQ("");
    setCategory(role === "examiner" ? "THESIS" : "");
    setTag("");
    setStartDate("");
    setEndDate("");
  }

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Document Repository</h2>
          <p className="text-muted-foreground mt-2">
            Search lifecycle documents, open secure downloads, and manage archive visibility.
          </p>
        </div>
        <Badge variant="outline" className="uppercase">
          {documents.length} visible
        </Badge>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
          {message}
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSearch}>
            <div className="grid gap-5 md:grid-cols-[1.4fr_0.9fr_0.9fr]">
              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Filename, title, abstract, period..."
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(val: string) => setCategory(val)}
                >
                  <SelectTrigger>
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
                <Label>Tag</Label>
                <Select
                  value={tag}
                  onValueChange={(val: string) => setTag(val)}
                >
                  <SelectTrigger>
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

            <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
              <div className="space-y-2">
                <Label>From</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>To</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={resetFilters}
              >
                Reset
              </Button>

              <Button
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Searching..." : "Search"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-md border-dashed p-12 text-center">
              <p className="text-lg font-bold">No documents found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Try a broader search or clear the filters.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Document</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="align-top">
                      <div className="font-semibold text-foreground">
                        {document.title ?? document.fileName}
                      </div>
                      <p className="mt-1 break-all text-xs font-medium text-muted-foreground">
                        {document.fileName}
                      </p>
                      {document.summary && (
                        <p className="mt-2 line-clamp-2 max-w-xl text-xs text-muted-foreground">
                          {document.summary}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline">
                        {getCategoryLabel(document.documentType)}
                      </Badge>
                      <p className="mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Version {document.version}
                        {document.isCurrentVersion ? " - Current" : ""}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex max-w-sm flex-wrap gap-1">
                        {document.tags.map((item) => (
                          <Badge
                            key={`${document.id}-${item}`}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm font-medium text-muted-foreground">
                      {formatDate(document.createdAt)}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDownload(document)}
                          disabled={busyId === `download-${document.id}`}
                        >
                          {busyId === `download-${document.id}` ? "Opening..." : "Download"}
                        </Button>
                        {role === "admin" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleArchive(document)}
                            disabled={busyId === `archive-${document.id}`}
                          >
                            {busyId === `archive-${document.id}` ? "Archiving..." : "Archive"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
