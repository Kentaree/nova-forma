import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { Store } from '../store';
import {
  deleteTemplate,
  exerciseProgress,
  listExercises,
  listTemplates,
  recentWorkouts,
  saveTemplate,
  ToolError,
} from './data';

const INSTRUCTIONS = `Nova Forma is the user's personal strength-training log. These tools read their logged
workouts and let you write workout templates, which appear in the Nova Forma app on their phone the next time
it syncs (when the app is opened). All weights are in kilograms. Exercise ids come from list_exercises; use only
ids it returns. Data only includes workouts the phone has synced.`;

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

async function run(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof ToolError) return fail(e.message);
    throw e;
  }
}

const templateExercise = z.object({
  exerciseId: z.string().describe('An id from list_exercises'),
  sets: z.number().int().min(1).max(20).describe('Target number of working sets'),
  repsMin: z.number().int().min(1).max(100).describe('Bottom of the target rep range'),
  repsMax: z.number().int().min(1).max(100).describe('Top of the target rep range (same as repsMin for a fixed target)'),
  supersetGroup: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Exercises sharing a number are done as a superset/circuit; they must be next to each other'),
});

/** A fresh MCP server bound to one store. Cheap to build, so the Worker makes one per request (stateless). */
export function createMcpServer(store: Store): McpServer {
  const server = new McpServer({ name: 'nova-forma', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'list_exercises',
    {
      title: 'List exercises',
      description:
        'Search the exercise library (built-in plus the user\'s custom exercises). Returns ids, names, how each is logged and the muscles it trains.',
      inputSchema: {
        query: z.string().max(100).optional().describe('Part of the name, e.g. "bench" or "row"'),
        muscle: z.string().max(50).optional().describe('A muscle group, e.g. "chest", "quads", "lats"'),
        limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => listExercises(store, args)),
  );

  server.registerTool(
    'get_recent_workouts',
    {
      title: 'Recent workouts',
      description:
        'Workouts the user logged recently, newest first, with every exercise and set. Sets show kg, reps, seconds, metres and RPE where logged; type is warmup or failure when not a normal working set.',
      inputSchema: {
        days: z.number().int().min(1).max(730).optional().describe('How far back to look. Default 28'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum workouts. Default 20'),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => recentWorkouts(store, args)),
  );

  server.registerTool(
    'get_exercise_progress',
    {
      title: 'Exercise progress',
      description:
        'One exercise across recent workouts: the sets from each session, the estimated one-rep max (Epley, kg) of the best set, and the best set in the period. Use it to judge progression and plateaus.',
      inputSchema: {
        exerciseId: z.string().describe('An id from list_exercises'),
        limit: z.number().int().min(1).max(100).optional().describe('Maximum sessions. Default 20'),
      },
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        const result = await exerciseProgress(store, args.exerciseId, args.limit);
        if (!result) throw new ToolError(`Unknown exercise id ${args.exerciseId}. Use list_exercises to find it.`);
        return result;
      }),
  );

  server.registerTool(
    'list_templates',
    {
      title: 'List templates',
      description: 'The user\'s saved workout templates, with exercises, target sets and rep ranges.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(() => listTemplates(store)),
  );

  server.registerTool(
    'save_template',
    {
      title: 'Save template',
      description:
        'Create a workout template, or replace an existing one by passing its id. It shows up in the Nova Forma app after the next sync. Exercises are performed in the order given.',
      inputSchema: {
        id: z.string().optional().describe('Pass a template id from list_templates to replace that template'),
        name: z.string().min(1).max(100).describe('e.g. "Push A" or "Upper (strength)"'),
        notes: z.string().max(2000).optional().describe('Shown with the template, e.g. progression guidance'),
        exercises: z.array(templateExercise).min(1).max(30),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      run(async () => {
        const doc = await saveTemplate(store, args);
        return { saved: true, id: doc.id, name: doc.name, exercises: doc.exercises.length };
      }),
  );

  server.registerTool(
    'delete_template',
    {
      title: 'Delete template',
      description: 'Delete a workout template. Logged workouts are not affected.',
      inputSchema: { id: z.string().describe('A template id from list_templates') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) =>
      run(async () => {
        await deleteTemplate(store, args.id);
        return { deleted: true, id: args.id };
      }),
  );

  return server;
}
