import { describe, expect, it } from "vitest";
import { errorResponse, jsonResponse, mockInterfaze } from "./helpers.js";

const MODEL = { id: "interfaze-beta", object: "model", owned_by: "interfaze", name: "Interfaze Beta" };
const MODELS_LIST = { object: "list", data: [MODEL] };

describe("models endpoints (interfaze#218 shapes)", () => {
  it("models.list() parses the OpenAI-enveloped response", async () => {
    const { interfaze, calls } = mockInterfaze(() => jsonResponse(MODELS_LIST));
    const page = await interfaze.models.list();
    expect(calls[0]!.url).toContain("/v1/models");
    expect(page.data.map((m) => m.id)).toContain("interfaze-beta");
    expect(page.data[0]!.owned_by).toBe("interfaze");
  });

  it("models.retrieve() returns the model", async () => {
    const { interfaze } = mockInterfaze(() => jsonResponse(MODEL));
    const m = await interfaze.models.retrieve("interfaze-beta");
    expect(m.id).toBe("interfaze-beta");
    expect(m.owned_by).toBe("interfaze");
  });

  it("models.retrieve() rejects on a model_not_found 404", async () => {
    const { interfaze } = mockInterfaze(() =>
      errorResponse(404, {
        message: "The model 'nope' does not exist",
        type: "invalid_request_error",
        code: "model_not_found",
      }),
    );
    await expect(interfaze.models.retrieve("nope")).rejects.toThrow();
  });
});
