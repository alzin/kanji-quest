import { AppError } from "../domain/errors.js";
import type { ProgressSnapshot } from "../domain/models.js";
import type { ProgressRepository } from "./ports.js";
import { parseSaveData } from "./progress-validation.js";

export class ProgressService {
  constructor(private readonly repository: ProgressRepository) {}

  get(userId: string): Promise<ProgressSnapshot> {
    return this.repository.get(userId);
  }

  async save(userId: string, save: unknown, expectedVersion: unknown): Promise<ProgressSnapshot> {
    if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER) {
      throw new AppError("INVALID_VERSION", "expectedVersion must be a nonnegative safe integer.", 400);
    }
    const parsed = parseSaveData(save);
    const result = await this.repository.save(userId, parsed, expectedVersion);
    if (!result) throw new AppError("PROGRESS_CONFLICT", "Your progress changed on another device. Reload the saved progress before trying again.", 409);
    return result;
  }
}
