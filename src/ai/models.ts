import { db } from "../store";

export interface ModelConfig {
  id: string;
  provider: "claude" | "openrouter";
  modelId: string;
  displayName: string;
  enabled: boolean;
}

export async function getAvailableModels(): Promise<ModelConfig[]> {
  const rows = db
    .prepare(
      `SELECT id, provider, model_id as modelId, display_name as displayName, enabled
       FROM model_config
       ORDER BY provider, id`
    )
    .all() as Array<{
    id: string;
    provider: string;
    modelId: string;
    displayName: string;
    enabled: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider as "claude" | "openrouter",
    modelId: row.modelId,
    displayName: row.displayName,
    enabled: row.enabled === 1,
  }));
}

export async function getModelByAlias(alias: string): Promise<ModelConfig | null> {
  const row = db
    .prepare(
      `SELECT id, provider, model_id as modelId, display_name as displayName, enabled
       FROM model_config
       WHERE id = ?`
    )
    .get(alias) as
    | {
        id: string;
        provider: string;
        modelId: string;
        displayName: string;
        enabled: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider as "claude" | "openrouter",
    modelId: row.modelId,
    displayName: row.displayName,
    enabled: row.enabled === 1,
  };
}

export async function getModelById(id: string): Promise<ModelConfig | null> {
  return getModelByAlias(id);
}

export async function getModelByProviderId(modelId: string): Promise<ModelConfig | null> {
  const row = db
    .prepare(
      `SELECT id, provider, model_id as modelId, display_name as displayName, enabled
       FROM model_config
       WHERE model_id = ?`
    )
    .get(modelId) as
    | {
        id: string;
        provider: string;
        modelId: string;
        displayName: string;
        enabled: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider as "claude" | "openrouter",
    modelId: row.modelId,
    displayName: row.displayName,
    enabled: row.enabled === 1,
  };
}

export async function updateModel(
  id: string,
  updates: Partial<Pick<ModelConfig, "displayName" | "enabled">>
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.displayName !== undefined) {
    sets.push("display_name = ?");
    values.push(updates.displayName);
  }
  if (updates.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(updates.enabled ? 1 : 0);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = unixepoch()");
  values.push(id);

  db.prepare(`UPDATE model_config SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}
