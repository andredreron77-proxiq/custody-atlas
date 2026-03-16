/**
 * server/storage.ts
 *
 * Application storage interface.
 *
 * Domain-specific storage (users, questions, documents) now lives in
 * server/services/ — see auth.ts, questions.ts, documents.ts.
 *
 * IStorage remains here as the extension point for any future shared
 * CRUD operations that do not belong to a specific service module.
 *
 * TO CONNECT SUPABASE:
 *   - Replace MemStorage with a SupabaseStorage class that uses the
 *     Supabase client from server/lib/supabaseClient.ts
 *   - The service modules in server/services/ can import and use it directly.
 */

export interface IStorage {}

export class MemStorage implements IStorage {}

export const storage = new MemStorage();
