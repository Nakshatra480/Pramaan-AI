import type { Metadata } from "next";
import { VerifyForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Verify email" };

export default function Page() {
  return <VerifyForm />;
}
