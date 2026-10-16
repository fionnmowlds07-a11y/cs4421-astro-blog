// Creates (or finds) the rowing admin account and adds it to public.admins, so it can log in at
// /rowing/login and write rowing data. Safe to run again: it reuses an existing account.
//
//   npm run admin:create -- --email you@example.com
//
// It needs the project's SECRET key, which can do anything, so the script asks for it at a hidden
// prompt instead of reading .env: .env is handed to the website's container, and the website must
// never hold that key (ADR-002). Locally, the URL and secret key are shown by `npm run db:status`.

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const MIN_PASSWORD_LENGTH = 12;

/** Reads a line from the terminal; with hidden: true nothing is echoed (for keys and passwords). */
function ask(question, { hidden = false } = {}) {
	let muted = false;
	const output = new Writable({
		write(chunk, _encoding, done) {
			if (!muted) process.stdout.write(chunk);
			done();
		},
	});
	const rl = createInterface({ input: process.stdin, output, terminal: true });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			if (hidden) process.stdout.write('\n');
			resolve(answer.trim());
		});
		muted = hidden;
	});
}

/** Finds an existing account by email (the admin API lists users page by page). */
async function findUser(supabase, email) {
	for (let page = 1; ; page++) {
		const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw error;
		const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
		if (match || data.users.length < 200) return match ?? null;
	}
}

async function main() {
	const { values } = parseArgs({ options: { email: { type: 'string' }, url: { type: 'string' } } });
	const url = values.url ?? process.env.SUPABASE_URL ?? (await ask('Supabase URL: '));
	const secretKey = process.env.SUPABASE_SECRET_KEY ?? (await ask('Supabase secret key (hidden): ', { hidden: true }));
	const email = values.email ?? (await ask('Admin email: '));
	if (!url || !secretKey || !email) throw new Error('URL, secret key and email are all needed.');

	const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

	let user = await findUser(supabase, email);
	if (user) {
		console.log(`Account ${email} already exists; keeping its password.`);
	} else {
		const password = process.env.ADMIN_PASSWORD ?? (await ask(`Password for ${email} (hidden, ${MIN_PASSWORD_LENGTH}+ characters): `, { hidden: true }));
		if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
		// email_confirm: sign-ups are off and nobody else can use this address, so no confirmation email is needed.
		const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
		if (error) throw error;
		user = data.user;
		console.log(`Created account ${email}.`);
	}

	// The secret key bypasses Row Level Security, which is the only way to write to admins.
	const { error } = await supabase.from('admins').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
	if (error) throw error;
	console.log(`${email} is an admin and can log in at /rowing/login.`);
}

main().catch((error) => {
	console.error(`Could not create the admin: ${error.message}`);
	process.exit(1);
});
