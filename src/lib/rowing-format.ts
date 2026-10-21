// How rowing data is shown on the admin list (and later the public Rowing page).

/** "2026-10-20" → "20 Oct 2026". Dates from the database have no time, so they're read as UTC to stay on the same day. */
export const formatDate = (isoDate: string) =>
	new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IE', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});

/** 12000 → "12,000 m". */
export const formatDistance = (metres: number) => `${metres.toLocaleString('en-IE')} m`;

export const MACHINE_NAMES = { concept2: 'Concept2', rp3: 'RP3' } as const;
