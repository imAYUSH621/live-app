import { q } from '../db.js';

/** Increase today's progress on every active daily task that tracks this metric. */
export async function bumpTask(userId, metric, n = 1) {
  try {
    await q(
      `INSERT INTO task_progress(user_id, task_key, day, progress)
       SELECT $1, key, CURRENT_DATE, LEAST($3, target) FROM tasks WHERE metric=$2 AND active
       ON CONFLICT (user_id, task_key, day)
       DO UPDATE SET progress = LEAST(task_progress.progress + $3,
         (SELECT target FROM tasks t WHERE t.key = task_progress.task_key))`,
      [userId, metric, n],
    );
  } catch (e) {
    console.warn('[tasks]', e.message);
  }
}

export async function markActive(userId) {
  try {
    await q('INSERT INTO user_active_days(user_id, day) VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING', [userId]);
  } catch { /* ignore */ }
}
