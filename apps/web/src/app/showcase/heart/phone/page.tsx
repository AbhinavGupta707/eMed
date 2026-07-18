import type { Metadata } from "next";

import { HeartPhoneShowcase } from "@/features/showcase";

export const metadata: Metadata = {
  title: "Heart assessment · HomeRounds",
  description: "A guided synthetic phone assessment."
};

export default function HeartPhoneShowcasePage() {
  return <HeartPhoneShowcase />;
}
