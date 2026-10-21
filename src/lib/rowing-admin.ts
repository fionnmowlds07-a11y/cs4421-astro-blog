// Helpers shared by the rowing admin pages that save to the database.
import type { AdminAccess } from './admin-guard';

/** The status code for an admin page: 403 for someone who isn't the admin, 503 when Supabase can't be reached. */
export const adminStatus = (access: Exclude<AdminAccess, 'login'>) =>
	access === 'forbidden' ? 403 : access === 'unavailable' ? 503 : 200;

/** The text fields of a submitted form, so it can be shown again exactly as it was typed. */
export function formValues(form: FormData): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [name, value] of form) if (typeof value === 'string') values[name] = value;
	return values;
}

/** The part of a Supabase (PostgREST) error the pages need. */
export interface SaveError {
	code?: string;
}

/**
 * What to tell the admin when the database refuses a save. The forms already check everything first,
 * so these are rare: the row-level security said no, a database check failed, or Supabase is down.
 */
export function saveFailure(error: SaveError): { status: number; message: string } {
	// 42501: not allowed by row level security or grants.
	if (error.code === '42501') return { status: 403, message: "This account isn't allowed to change the rowing log." };
	// 23xxx: a constraint said no; 22xxx: a value the database couldn't read.
	if (error.code?.startsWith('23') || error.code?.startsWith('22')) {
		return { status: 422, message: "The database didn't accept this. Check the values and try again." };
	}
	return { status: 503, message: "Couldn't save right now. What you typed is still here, so try again in a moment." };
}
