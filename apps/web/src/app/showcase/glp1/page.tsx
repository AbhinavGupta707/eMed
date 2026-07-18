import type { Metadata } from "next";

import { GlpShowcase } from "@/features/showcase";

export const metadata: Metadata = {
  title: "GLP-1 Tolerance Round · HomeRounds",
  description: "A synthetic treatment-tolerance HomeRounds journey."
};

export default function GlpShowcasePage() {
  return <GlpShowcase />;
}
