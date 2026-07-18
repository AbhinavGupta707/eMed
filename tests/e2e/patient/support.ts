import { expect, type Page } from "@playwright/test";

export type StructuredReportAnswers = Readonly<{
  chestPain: "Yes" | "No" | "I’m not sure";
  severeBreathlessness: "Yes" | "No" | "I’m not sure";
  fainted: "Yes" | "No" | "I’m not sure";
  weakness: "None" | "Mild" | "Moderate" | "Severe" | "I’m not sure";
  palpitations: "None" | "Comes and goes" | "Happening now" | "I’m not sure";
}>;

export const calmReport: StructuredReportAnswers = {
  chestPain: "No",
  severeBreathlessness: "No",
  fainted: "No",
  weakness: "Mild",
  palpitations: "None"
};

export function observeBrowserFailures(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  return { consoleErrors, pageErrors };
}

export async function expectNoBrowserFailures(failures: {
  consoleErrors: string[];
  pageErrors: string[];
}): Promise<void> {
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
}

export async function installCameraState(
  page: Page,
  mode: "unsupported" | "permission-denied" | "weak-signal"
): Promise<void> {
  await page.addInitScript((selectedMode) => {
    const rearCamera: MediaDeviceInfo = {
      deviceId: "synthetic-rear-camera",
      groupId: "synthetic-camera-group",
      kind: "videoinput",
      label: "Synthetic Back Camera",
      toJSON: () => ({
        deviceId: "synthetic-rear-camera",
        groupId: "synthetic-camera-group",
        kind: "videoinput",
        label: "Synthetic Back Camera"
      })
    };

    if (selectedMode === "unsupported") {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: undefined
      });
      return;
    }

    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: () =>
          Promise.resolve({
            state: selectedMode === "permission-denied" ? "denied" : "granted"
          })
      }
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () => Promise.resolve([rearCamera]),
        getUserMedia: async () => {
          if (selectedMode === "permission-denied") {
            throw new DOMException("Synthetic permission denial", "NotAllowedError");
          }

          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 240;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Synthetic camera canvas is unavailable");

          const originalNow = performance.now.bind(performance);
          const base = originalNow();
          let elapsed = 0;
          const renderFrame = () => {
            const phase = (2 * Math.PI * 72 * elapsed) / 60_000;
            const pulse = 4 * Math.sin(phase) + 0.32 * Math.sin(phase * 2);
            context.fillStyle = `rgb(${180 + pulse * 0.35}, ${105 + pulse}, ${70 + pulse * 0.1})`;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "rgb(255, 255, 255)";
            context.fillRect(0, 0, canvas.width * 0.2, canvas.height);
          };
          renderFrame();

          const originalCreateImageBitmap = window.createImageBitmap.bind(window);
          Object.defineProperty(window, "createImageBitmap", {
            configurable: true,
            value: () => originalCreateImageBitmap(canvas)
          });
          Object.defineProperty(performance, "now", {
            configurable: true,
            value: () => {
              elapsed += 1000 / 60;
              renderFrame();
              return base + elapsed;
            }
          });

          const originalSetTimeout = window.setTimeout.bind(window);
          Object.defineProperty(window, "setTimeout", {
            configurable: true,
            value: (handler: TimerHandler, timeout = 0) =>
              originalSetTimeout(handler, timeout >= 30 && timeout <= 40 ? 0 : timeout)
          });

          return canvas.captureStream(30);
        }
      }
    });
  }, mode);
}

export async function startRound(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  await page
    .getByLabel(
      "I understand this check does not diagnose a condition or contact a medical service."
    )
    .check();
  await page.getByRole("button", { name: "Start my check-in" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Three questions before we talk." })
  ).toBeVisible();
}

async function choose(page: Page, legend: string, answer: string): Promise<void> {
  await page.getByRole("group", { name: legend }).getByLabel(answer, { exact: true }).check();
}

export async function submitTextReport(
  page: Page,
  answers: StructuredReportAnswers,
  options: Readonly<{ proveNoKeyVoiceFallback?: boolean }> = {}
): Promise<void> {
  await choose(page, "Are you having chest pain now?", answers.chestPain);
  await choose(page, "Are you severely short of breath now?", answers.severeBreathlessness);
  await choose(page, "Have you fainted?", answers.fainted);
  await page.getByRole("button", { name: "Continue to conversation" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell me what’s changed." })
  ).toBeVisible();
  await choose(page, "How weak do you feel?", answers.weakness);
  await choose(
    page,
    "Are you noticing a racing, pounding, or fluttering feeling?",
    answers.palpitations
  );

  if (options.proveNoKeyVoiceFallback) {
    await page.getByRole("button", { name: "Start voice" }).click();
    await expect(
      page.getByText("Voice is not configured. You can complete this step with text.", {
        exact: true
      })
    ).toBeVisible();
  }

  await page
    .getByRole("textbox", { name: "Your check-in text" })
    .fill("I feel steady during this fictional check-in.");
  await page.getByRole("button", { name: "Confirm this text" }).click();
  await expect(page.getByRole("button", { name: "Text confirmed" })).toBeDisabled();
  await page.getByRole("button", { name: "Review my report" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Let’s make sure I understood." })
  ).toBeVisible();
  await page.getByLabel("I reviewed every field and confirm these are my answers.").check();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
}

export async function confirmProgrammeTask(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible();
  await page.getByLabel("I want to save one sample review request.").check();
  await page.getByRole("button", { name: "Save review request" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /review (request|message) saved/i })
  ).toBeVisible();
  await expect(
    page.getByText("Waiting for HomeRounds review", { exact: true }).first()
  ).toBeVisible();
}

export function numericMeasurement(page: Page) {
  return page.getByText(/\b\d+(?:\.\d+)?\s*bpm\b/i);
}
