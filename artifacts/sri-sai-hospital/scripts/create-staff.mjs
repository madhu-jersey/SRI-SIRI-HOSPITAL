// Creates (or updates) a dashboard login in Supabase and links it to Dr. Sritha.
// Run from artifacts/sri-sai-hospital:  pnpm create-staff
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the repo-root .env.local.
// The password is typed in hidden and never printed or saved anywhere else.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
try {
  for (const line of readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
} catch { /* rely on the environment */ }

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY are needed (in .env.local).');
  process.exit(1);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (text) => { if (text.startsWith(question)) rl.output.write(text); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const email = (await ask('Doctor email: ')).toLowerCase();
const name = (await ask('Name to show (e.g. Dr. Sritha): ')) || 'Dr. Sritha';
const password = await ask('Password (at least 10 characters, hidden): ', { hidden: true });
if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
  console.error('Please give a valid email and a password of at least 10 characters.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: doctor, error: doctorError } = await db.from('doctors').select('id').eq('slug', 'sritha').maybeSingle();
if (doctorError || !doctor) {
  console.error('Doctor record not found. Run the migration in supabase/migrations first.');
  process.exit(1);
}

let userId;
const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  // Already exists: find the user and set the new password.
  const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((user) => user.email?.toLowerCase() === email);
  if (error || !existing) {
    console.error(`Could not create the login: ${created.error.message}`);
    process.exit(1);
  }
  const updated = await db.auth.admin.updateUserById(existing.id, { password });
  if (updated.error) {
    console.error(`Could not update the password: ${updated.error.message}`);
    process.exit(1);
  }
  userId = existing.id;
  console.log('Login already existed; password updated.');
} else {
  userId = created.data.user.id;
}

const { error: staffError } = await db.from('staff').upsert({ user_id: userId, doctor_id: doctor.id, role: 'doctor', display_name: name });
if (staffError) {
  console.error(`Could not give dashboard access: ${staffError.message}`);
  process.exit(1);
}
console.log(`Done. ${email} can now sign in at /dashboard.`);
