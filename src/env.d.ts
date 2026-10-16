import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminAccess } from './lib/admin-guard';

// What the middleware hands to pages under /rowing/admin (see src/middleware.ts).
declare global {
	namespace App {
		interface Locals {
			admin?: {
				access: Exclude<AdminAccess, 'login'>;
				email?: string;
				/** Acts as the logged-in user, so the database's own rules decide what they can change. */
				supabase?: SupabaseClient;
			};
		}
	}
}
