export type QaCredentials = {
  email: string;
  password: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const qaEnv = {
  baseUrl: process.env.QA_BASE_URL ?? 'http://127.0.0.1:5000',
  defaultUser: {
    email: process.env.QA_USER_EMAIL,
    password: process.env.QA_USER_PASSWORD,
  },
  freshUser: {
    email: process.env.QA_FRESH_USER_EMAIL,
    password: process.env.QA_FRESH_USER_PASSWORD,
    preferredName: process.env.QA_FRESH_USER_PREFERRED_NAME ?? 'Taylor',
  },
  caseId: process.env.QA_CASE_ID,
};

export function getDefaultUserCredentials(): QaCredentials {
  return {
    email: requiredEnv('QA_USER_EMAIL'),
    password: requiredEnv('QA_USER_PASSWORD'),
  };
}

export function getFreshUserCredentials(): QaCredentials {
  return {
    email: requiredEnv('QA_FRESH_USER_EMAIL'),
    password: requiredEnv('QA_FRESH_USER_PASSWORD'),
  };
}
