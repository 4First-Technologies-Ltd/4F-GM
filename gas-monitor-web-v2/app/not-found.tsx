import type { Metadata } from "next";
import { NotFoundTerminal } from "@/components/motion/not-found/terminal";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <NotFoundTerminal
      code="404"
      title="This page ran out."
      description="The link you followed doesn't lead anywhere on 4FG."
      homeHref="/"
      homeLabel="Back home"
      browseHref="/marketplace"
      browseLabel="Browse the marketplace"
    />
  );
}
