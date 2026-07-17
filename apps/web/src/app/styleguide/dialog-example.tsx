"use client";

import { Button, Dialog } from "@homerounds/ui";
import { useState } from "react";

export function DialogExample() {
  const [surface, setSurface] = useState<"dialog" | "drawer" | null>(null);

  return (
    <div>
      <div className="hr-inline-actions">
        <Button onClick={() => setSurface("dialog")} variant="secondary">
          Open dialog
        </Button>
        <Button onClick={() => setSurface("drawer")} variant="secondary">
          Open drawer
        </Button>
      </div>
      <Dialog
        description="Review the bounded synthetic evidence before returning to the style guide."
        footer={<Button onClick={() => setSurface(null)}>Done</Button>}
        onOpenChange={(open) => {
          if (!open) setSurface(null);
        }}
        open={surface !== null}
        placement={surface === "drawer" ? "drawer" : "center"}
        title={surface === "drawer" ? "Synthetic evidence drawer" : "Synthetic review dialog"}
      >
        <p>
          This example demonstrates focus containment, Escape-to-close, a labelled close control,
          and a non-diagnostic disclosure surface.
        </p>
      </Dialog>
    </div>
  );
}
