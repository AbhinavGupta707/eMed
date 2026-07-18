import { redirect } from "next/navigation";

import { publicDemoSessionHref, safeDemoDestination } from "@/server/demo-access";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccessPage(props: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const search = await props.searchParams;
  const role = first(search.role) === "clinician" ? "clinician" : "patient";
  const destination = safeDemoDestination(role, first(search.next));
  if (process.env.APP_ENV !== "demo") redirect(destination);
  redirect(publicDemoSessionHref(role, destination));
}
