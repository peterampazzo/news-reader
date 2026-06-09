import { createFileRoute } from "@tanstack/react-router";
import { NewsStream } from "@/components/NewsStream";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Real-time Chronicle — Live News Stream" },
      {
        name: "description",
        content:
          "Real-time terminal-style news stream merging multiple sources into one chronological feed.",
      },
      { property: "og:title", content: "Real-time Chronicle — Live News Stream" },
      {
        property: "og:description",
        content:
          "Real-time terminal-style news stream merging multiple sources into one chronological feed.",
      },
    ],
  }),
  component: NewsStream,
});
