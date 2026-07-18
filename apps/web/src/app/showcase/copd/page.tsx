import type { Metadata } from "next";

import { CopdShowcase } from "@/features/showcase";

export const metadata: Metadata = {
  title: "COPD Change Round · HomeRounds",
  description: "A synthetic multimodal HomeRounds perception journey."
};

export default function CopdShowcasePage() {
  return <CopdShowcase />;
}
