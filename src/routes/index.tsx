import { createFileRoute } from "@tanstack/react-router";
import { NewsStream } from "@/components/NewsStream";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Newsdesk — Live Stream" },
      {
        name: "description",
        content:
          "Real-time terminal-style news stream merging Il Post, Corriere and DR.dk into one chronological feed.",
      },
      { property: "og:title", content: "Newsdesk — Live Stream" },
      {
        property: "og:description",
        content:
          "Real-time terminal-style news stream merging Il Post, Corriere and DR.dk into one chronological feed.",
      },
    ],
  }),
  component: NewsStream,
});
