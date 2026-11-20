"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      title="Something went wrong."
      description="Pramaan couldn't load this page. Your research and documents are safe."
      action={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/app" variant="secondary">
            Go home
          </ButtonLink>
        </>
      }
    />
  );
}
