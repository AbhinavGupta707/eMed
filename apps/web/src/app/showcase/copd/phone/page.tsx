import type { Metadata } from "next";

import { CopdPhoneShowcase } from "@/features/showcase";

export const metadata: Metadata = {
  title: "Phone assessment · HomeRounds",
  description: "A guided synthetic phone assessment."
};

export default function CopdPhoneShowcasePage() {
  return <CopdPhoneShowcase />;
}
