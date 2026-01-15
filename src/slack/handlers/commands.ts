import { getAvailableModels, getModelByAlias } from "../../ai/models";
import { updateUserModel } from "../../services/users";
import { resetUserConversation } from "../../services/conversations";
import type { User } from "../../services/users";

export interface Command {
  name: string;
  args: string[];
}

const COMMANDS = ["use", "models", "reset", "help"] as const;

export function parseCommand(text: string): Command | null {
  const trimmed = text.toLowerCase().trim();
  const parts = trimmed.split(/\s+/);
  const name = parts[0];

  if (COMMANDS.includes(name as (typeof COMMANDS)[number])) {
    return {
      name,
      args: parts.slice(1),
    };
  }

  return null;
}

export async function handleCommand(command: Command, user: User): Promise<string> {
  switch (command.name) {
    case "use":
      return handleUseCommand(command.args, user);
    case "models":
      return handleModelsCommand(user);
    case "reset":
      return handleResetCommand(user);
    case "help":
      return handleHelpCommand();
    default:
      return "Unknown command. Type `help` to see available commands.";
  }
}

async function handleUseCommand(args: string[], user: User): Promise<string> {
  if (args.length === 0) {
    return `Current model: *${user.preferredModel}*\n\nTo switch models, use: \`use <model>\`\nTo see available models: \`models\``;
  }

  const modelAlias = args[0];
  const model = await getModelByAlias(modelAlias);

  if (!model) {
    const models = await getAvailableModels();
    const modelList = models.map((m) => `\`${m.id}\``).join(", ");
    return `Model "${modelAlias}" not found.\n\nAvailable models: ${modelList}`;
  }

  if (!model.enabled) {
    return `Model "${model.displayName}" is currently disabled.`;
  }

  await updateUserModel(user.id, model.id);

  return `Switched to *${model.displayName}*. How can I help?`;
}

async function handleModelsCommand(user: User): Promise<string> {
  const models = await getAvailableModels();

  const claudeModels = models.filter((m) => m.provider === "claude");
  const openrouterModels = models.filter((m) => m.provider === "openrouter");

  let response = "*Available Models*\n\n";

  if (claudeModels.length > 0) {
    response += "*Claude (Anthropic)*\n";
    for (const model of claudeModels) {
      const current = model.id === user.preferredModel ? " (current)" : "";
      const status = model.enabled ? "" : " [disabled]";
      response += `  \`${model.id}\` - ${model.displayName}${current}${status}\n`;
    }
    response += "\n";
  }

  if (openrouterModels.length > 0) {
    response += "*Other Models (OpenRouter)*\n";
    for (const model of openrouterModels) {
      const current = model.id === user.preferredModel ? " (current)" : "";
      const status = model.enabled ? "" : " [disabled]";
      response += `  \`${model.id}\` - ${model.displayName}${current}${status}\n`;
    }
  }

  response += "\nTo switch: `use <model>`";

  return response;
}

async function handleResetCommand(user: User): Promise<string> {
  await resetUserConversation(user.id);
  return "Conversation reset. Starting fresh!";
}

function handleHelpCommand(): string {
  return `*Finn Commands*

\`use <model>\` - Switch AI model (e.g., \`use gpt-4\`)
\`models\` - List available models
\`reset\` - Clear conversation context
\`help\` - Show this help message

Just send me a message to chat!`;
}
