"use client";

import { AgentInterface, useSystemThemeMode } from "@openuidev/react-ui";
import { CalendarDays, Compass, Map, Plane, Scale, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { QuotaBadge } from "@/components/quota-badge";
import { AdminChats } from "@/components/admin-chats";
import { createLocalChatStorage, createPersistentChatLLM } from "@/lib/chat-storage";
import { library } from "@/library";

// The route streams AG-UI events and receives the thread as AG-UI messages. Each turn is saved
// in this browser (the 5 most recent chats) and survives switching chats mid-answer.
const CHAT_URL = "/api/chat";
const llm = createPersistentChatLLM(CHAT_URL);

const starters = [
  {
    displayText: "Discover: beach trips in December",
    prompt: "I'm in Delhi. Where can I go for a beach holiday in December? Flights under ₹20,000 if possible.",
    icon: <Compass size={16} />,
  },
  {
    displayText: "Dates: cheapest days to fly to Bali",
    prompt: "When is it cheapest to fly from Mumbai to Bali next month?",
    icon: <CalendarDays size={16} />,
  },
  {
    displayText: "Flights: Bengaluru → Singapore",
    prompt: "Find non-stop flights from Bengaluru to Singapore for 2 adults on the second Friday of next month.",
    icon: <Plane size={16} />,
  },
  {
    displayText: "Plan: 5 days in Tokyo with a budget",
    prompt: "Plan a 5-day trip to Tokyo in April from Delhi for 2 people, mid-range. Include a day-by-day itinerary and budget.",
    icon: <Map size={16} />,
  },
  {
    displayText: "Compare: Bali vs Phuket vs Maldives",
    prompt: "Compare Bali, Phuket and the Maldives for a 6-night honeymoon in February from Mumbai.",
    icon: <Scale size={16} />,
  },
  {
    displayText: "Help me pick a holiday",
    prompt: "Plan a trip for me. I'm not sure where to go yet.",
    icon: <Sparkles size={16} />,
  },
];

export default function Page() {
  const mode = useSystemThemeMode();
  const theme = useMemo(() => ({ mode }), [mode]);
  const storage = useMemo(() => createLocalChatStorage(CHAT_URL), []);

  return (
    <div className="app-shell">
      <AgentInterface
        llm={llm}
        storage={storage}
        componentLibrary={library}
        agentName="Wayfinder"
        logoUrl="/icon.svg"
        theme={theme}
        starters={starters}
        starterVariant="long"
      >
        {/* Default sidebar layout, plus the daily answer counter pinned to the bottom. */}
        <AgentInterface.Sidebar>
          <div className="openui-agent-sidebar-actions">
            <AgentInterface.SidebarHeader />
            <div className="openui-agent-sidebar-primary-actions">
              <AgentInterface.NewChatButton />
            </div>
          </div>
          <AgentInterface.SidebarContent>
            <AgentInterface.ThreadList />
            <AdminChats />
          </AgentInterface.SidebarContent>
          <QuotaBadge />
        </AgentInterface.Sidebar>
        <AgentInterface.Welcome
          title="Where to next?"
          description="Plan a trip, find destinations, spot the cheapest days to fly and compare flights. Demo data: prices and flights are simulated."
        />
        <AgentInterface.Composer placeholder="e.g. Cheap weekend trips from Mumbai in November" />
      </AgentInterface>
    </div>
  );
}
