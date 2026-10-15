import type { APIRoute } from 'astro';
import { FOOTBALL_DATA_API_KEY } from 'astro:env/server';
import { getManUnitedSummary } from '../../../lib/football';
import { footballDataResponse } from '../../../lib/football-endpoint';

export const prerender = false;

export const GET: APIRoute = () =>
	footballDataResponse(FOOTBALL_DATA_API_KEY, 'Man United stats', getManUnitedSummary);
