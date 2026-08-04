import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../../lib/api-client";
import { errorMessage } from "../../lib/errors";
import { Button, Input } from "@trellis/ui";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** First-run screen shown until the account has an organization. */
export function CreateOrgScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.createOrganization({ name, slug: slugify(name) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-white to-violet-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-blue-500 to-violet-500 text-lg font-bold text-white">
          T
        </div>
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">
          Name your organization
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          The top-level home for your team's workspaces and boards.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            className="h-10"
            placeholder="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {name && (
            <p className="text-xs text-neutral-400">
              URL: trellis.app/{slugify(name)}
            </p>
          )}
          {create.error && (
            <p className="text-sm text-red-600">{errorMessage(create.error)}</p>
          )}
          <Button type="submit" disabled={create.isPending} className="h-10">
            Create organization
          </Button>
        </form>
      </div>
    </main>
  );
}
