type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

function qaBaseUrl(): string {
  return process.env.QA_BASE_URL ?? "http://localhost:5050";
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`${qaBaseUrl()}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `API ${method} ${path} failed (${response.status} ${response.statusText})${
        payload ? `: ${typeof payload === "string" ? payload : JSON.stringify(payload)}` : ""
      }`,
    );
  }

  return payload as T;
}

export async function resetUserState(email: string): Promise<void> {
  const resetToken = process.env.QA_RESET_TOKEN;
  if (!resetToken) {
    throw new Error("Missing QA_RESET_TOKEN. Cannot reset test user state.");
  }

  const response = await fetch(`${qaBaseUrl()}/api/qa/reset-onboarding-user`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-qa-reset-token": resetToken,
    },
    body: JSON.stringify({ email }),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      `QA reset failed (${response.status} ${response.statusText})${
        payload ? `: ${typeof payload === "string" ? payload : JSON.stringify(payload)}` : ""
      }`,
    );
  }
}

export async function seedCase<T = { id: string }>(
  token: string,
  caseData: Record<string, unknown>,
): Promise<T> {
  const data = await apiRequest<{ case?: { id?: string }; id?: string }>(
    "POST",
    "/api/cases",
    caseData,
    token,
  );
  const caseId = data.case?.id ?? data.id;
  return { id: caseId } as T;
}

export async function deleteCase(token: string, caseId: string): Promise<void> {
  await apiRequest("DELETE", `/api/cases/${caseId}`, undefined, token);
}

export async function getUsageState<T = unknown>(token: string): Promise<T> {
  return apiRequest<T>("GET", "/api/usage", undefined, token);
}
