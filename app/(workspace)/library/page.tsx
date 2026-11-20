import type { Metadata } from "next";
import { LibraryBrowser } from "@/components/library/LibraryBrowser";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const { upload } = await searchParams;
  return (
    <div className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-10 sm:py-14">
      <PageHeader title="Library" description="Your private knowledge base. Everything here can be cited as evidence." />
      <div className="mt-8">
        <LibraryBrowser initialUpload={upload === "1"} />
      </div>
    </div>
  );
}
