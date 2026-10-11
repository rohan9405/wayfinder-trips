import type { PromptOptions } from "@openuidev/lang-core";
import { openuiChatPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";

// The chat library's rules, minus the one that tells the model to make up plausible data:
// this app must only show what the tools return. Server-safe (no React components).
export const promptOptions: PromptOptions = {
  ...openuiChatPromptOptions,
  additionalRules: (openuiChatPromptOptions.additionalRules ?? []).filter(
    (rule) => !rule.startsWith("When asked about data, generate realistic"),
  ),
};
