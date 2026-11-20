"use client";

import { Fragment } from "react";
import { parseRichText } from "@/lib/utils/citations";
import { Citation } from "./Citation";

/** Renders report text, turning `[n]` markers into interactive citations. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((seg, i) =>
        seg.type === "text" ? <Fragment key={i}>{seg.value}</Fragment> : <Citation key={i} index={seg.index} />,
      )}
    </>
  );
}
