import type { APIRoute } from 'astro';
import { FOOTBALL_DATA_API_KEY } from 'astro:env/server';
import { footballDataResponse } from '../../../lib/football-endpoint';
import { getPremierLeagueData } from '../../../lib/league';

export const prerender = false;

// Tables (overall/home/away), team stats, position history, United's head-to-heads, scorers and squad.
export const GET: APIRoute = () =>
	footballDataResponse(FOOTBALL_DATA_API_KEY, 'Premier League stats', getPremierLeagueData);
