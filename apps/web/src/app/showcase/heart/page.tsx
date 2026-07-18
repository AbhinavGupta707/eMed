import type { Metadata } from "next";

import { HeartShowcase } from "@/features/showcase";

export const metadata: Metadata = {
  title: "Heart-Failure Change Round · HomeRounds",
  description: "An adaptive multimodal HomeRounds assessment and resolution journey."
};

export default function HeartShowcasePage() {
  return <HeartShowcase />;
}
