import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HeartShowcase } from "@/features/showcase";
import { publicDemoSessionHref } from "@/server/demo-access";
import { DEMO_SESSION_COOKIE_NAME } from "@/server/identity";

export const metadata: Metadata = {
  title: "Heart-Failure Change Round · HomeRounds",
  description: "An adaptive multimodal HomeRounds assessment and resolution journey."
};

export const dynamic = "force-dynamic";

export default async function HeartShowcasePage() {
  if (process.env.APP_ENV === "demo" && !(await cookies()).has(DEMO_SESSION_COOKIE_NAME)) {
    redirect(publicDemoSessionHref("patient", "/showcase/heart"));
  }

  return <HeartShowcase />;
}
